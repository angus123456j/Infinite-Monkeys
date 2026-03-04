import express, { Request, Response, NextFunction } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import rateLimit from "express-rate-limit";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHARED_SECRET = process.env.SHARED_SECRET;

// Validate required environment variables
if (!GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY environment variable is required");
  console.error("Set it in your .env file or environment");
  process.exit(1);
}

// Initialize Google Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// CORS configuration - allow requests from client
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    methods: ["POST", "GET"],
    allowedHeaders: ["Content-Type", "X-Shared-Secret"],
  })
);

app.use(express.json());

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  message: {
    error: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication middleware (optional - only if SHARED_SECRET is set)
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!SHARED_SECRET) {
    // No secret configured, allow all requests (for local development)
    return next();
  }

  const providedSecret = req.headers["x-shared-secret"];
  if (providedSecret !== SHARED_SECRET) {
    return res.status(401).json({
      error: "Unauthorized. Invalid or missing X-Shared-Secret header.",
    });
  }

  next();
};

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rewrite endpoint
app.post(
  "/api/rewrite",
  limiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { text, prompt } = req.body;

      // Validate request body
      if (!text || typeof text !== "string") {
        return res.status(400).json({
          error: "Missing or invalid 'text' field in request body",
        });
      }

      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({
          error: "Missing or invalid 'prompt' field in request body",
        });
      }

      // Call Google Gemini API
      // Using gemini-2.5-flash (confirmed working model)
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: `You are a helpful writing assistant. Rewrite the provided text according to the user's instructions. 
Return only the rewritten text, without explanations or meta-commentary. 
Preserve the meaning and intent while improving clarity, style, or following the specific instructions given.`
      });

      const userPrompt = `Text to rewrite:\n\n${text}\n\nUser instruction: ${prompt}\n\nPlease rewrite the text according to the instruction.`;

      const result = await model.generateContent(userPrompt);
      const response = result.response;
      const rewrite = response.text();

      // Return the rewrite
      res.json({
        rewrite,
      });
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);

      // Handle specific Gemini API errors
      if (error.status === 401 || error.status === 403) {
        return res.status(500).json({
          error: "Invalid API key. Please check GEMINI_API_KEY environment variable.",
        });
      }

      if (error.status === 404) {
        // Model not found - try to provide helpful error
        return res.status(500).json({
          error: "Model not found. The model name may be incorrect or not available in your region.",
          details: error.message || "Try checking available models in Google AI Studio.",
          suggestion: "Available models might be: gemini-1.5-flash-latest, gemini-1.5-pro-latest, or gemini-pro"
        });
      }

      if (error.status === 429) {
        return res.status(429).json({
          error: "Rate limit exceeded. Please try again later.",
        });
      }

      if (error.status === 400) {
        return res.status(400).json({
          error: "Invalid request to Gemini API",
          details: error.message,
        });
      }

      // Generic error
      return res.status(500).json({
        error: "Failed to generate rewrite",
        details: error.message || "Unknown error",
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${SHARED_SECRET ? "Authentication enabled" : "No authentication (local dev)"}`);
});
