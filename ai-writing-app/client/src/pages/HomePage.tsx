import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Scene3D from "../components/Scene3D";

const VIDEO_PATH = "/models/monkeyvid.mp4";
const AUTO_SCROLL_AT = 0.9;
const TYPEWRITER_LINE1 = "Infinite drafts. One perfect sentence.";
const TYPEWRITER_LINE2 = "Write alongside infinite minds.";
const TYPING_END_AT = 0.75;
const CHAR_INTERVAL_MS = 40; // one char every 40ms ≈ 25 chars/sec
const ABOUT_PHRASE_SLOT_MS = 7200;

const ABOUT_PHRASES: Array<{ text: string; rgb: string; scale?: number }> = [
  { text: "Writing is the painting of the voice", rgb: "46,150,255", scale: 0.53 }, // blue
  { text: "A team of editors behind you", rgb: "255,200,64", scale: 0.65 }, // gold
  { text: "Infinite possibilities", rgb: "46,150,255", scale: 0.80 },
  { text: "Infinite memory", rgb: "46,150,255" },
  { text: "Context you control", rgb: "255,200,64" , scale: 0.83},
  { text: "AI Agents you create", rgb: "46,150,255", scale: 0.80 },
  { text: "Explore", rgb: "255,200,64" },
  { text: "Infinite productivity", rgb: "46,150,255", scale: 0.80 },
  { text: "Infinite Ideas", rgb: "255,200,64" },
  { text: "Carpe Diem", rgb: "46,150,255" },
  // extras
  { text: "Rewrite in seconds", rgb: "255,200,64" },
  { text: "Draft without fear", rgb: "46,150,255" },
  { text: "Your drive, your rules", rgb: "255,200,64", scale: 0.86 },
  { text: "One sentence at a time", rgb: "46,150,255", scale: 0.80 },
  { text: "A new medium for writing", rgb: "255,200,64", scale: 0.70 },

];

const ABOUT_PANELS: Array<{
  id: 1 | 2 | 3;
  title: string;
  desc: string;
}> = [
  {
    id: 1,
    title: "Why Infinite Monkeys",
    desc: `Generic chat UIs make you re-explain your project every time. Here, the document is the stage: highlight only what you want to change, summon help on that slice, and iterate in small, reversible steps so your voice stays yours.

What’s different is how it pairs with the Context Library and Monkey Agents—persistent memory plus specialists—so you’re not fighting one-size-fits-all polish when you want craft, clarity, and control.`,
  },
  {
    id: 2,
    title: "Context Library",
    desc: `Contexts are reusable bundles of what the model should “remember”: tone, world rules, client voice, citations, hard bans, and soft preferences. Tag them, refine them, and attach one or many when you rewrite—no pasting the same brief into chat again and again.

That’s how you beat tone drift and “almost right” drafts: every pass stays aligned with *your* canon and constraints instead of slowly erasing them.`,
  },
  {
    id: 3,
    title: "Monkey Agents",
    desc: `One assistant can’t be best at everything. Agents are specialists—diction, dialogue, continuity, structure, careful tightening—each with its own role, behavior, and limits. Swap agents on the same selection to compare real alternatives, not one house style.

You shape agents over time; Context Library carries the shared brief. Together it feels less like autocorrect and more like a fast, on-brief writers’ room.`,
  },
];

const ABOUT_PANEL_KEYWORDS = [
  "Infinite Monkeys",
  "Context Library",
  "Monkey Agents",
  "specialists",
  "tone",
  "voice",
  "rewrite",
  "control",
  "memory",
  "constraints",
  "writers’ room",
  "writers' room",
];

const aboutPanelKeywordPattern = new RegExp(
  `(${[...ABOUT_PANEL_KEYWORDS]
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})`,
  "gi",
);
const aboutPanelKeywordLookup = new Set(
  ABOUT_PANEL_KEYWORDS.map((k) => k.toLowerCase()),
);

function renderAboutPanelDesc(desc: string) {
  return desc.split(aboutPanelKeywordPattern).map((part, idx) => {
    if (!part) return part;
    if (aboutPanelKeywordLookup.has(part.toLowerCase())) {
      return (
        <span key={`kw-${idx}-${part}`} className="home-about-keyword">
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const entrySection = searchParams.get("section");
  const videoRef = useRef<HTMLVideoElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const scrollLockedRef = useRef(true);
  const hasAutoScrolledRef = useRef(false);
  const intervalIdRef = useRef<number | null>(null);
  const [visibleChars1, setVisibleChars1] = useState(0);
  const [visibleChars2, setVisibleChars2] = useState(0);
  const [aboutPhraseIndex, setAboutPhraseIndex] = useState(0);
  const [activePanel, setActivePanel] = useState<number | null>(null);
  const [tapMode, setTapMode] = useState(false);
  const line2UnlockedRef = useRef(false);

  useEffect(() => {
    if (visibleChars1 >= TYPEWRITER_LINE1.length) line2UnlockedRef.current = true;
  }, [visibleChars1]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setAboutPhraseIndex((prev) => (prev + 1) % ABOUT_PHRASES.length);
    }, ABOUT_PHRASE_SLOT_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const sync = () => setTapMode(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const about = aboutRef.current;
    const desk = deskRef.current;
    if (!video || !about || !desk) return;

    // Global wheel/touch guard used while Home should be bounded.
    const blockScroll = (e: Event) => {
      if (scrollLockedRef.current) e.preventDefault();
    };

    // Allow deep-link entry points from Drive header.
    if (entrySection === "desk" || entrySection === "about") {
      hasAutoScrolledRef.current = true;
      scrollLockedRef.current = true;
      window.addEventListener("wheel", blockScroll, { passive: false });
      window.addEventListener("touchmove", blockScroll, { passive: false });
      requestAnimationFrame(() => {
        (entrySection === "desk" ? desk : about).scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      });
      return () => {
        window.removeEventListener("wheel", blockScroll);
        window.removeEventListener("touchmove", blockScroll);
      };
    }

    // Block user scroll during video
    window.addEventListener("wheel", blockScroll, { passive: false });
    window.addEventListener("touchmove", blockScroll, { passive: false });

    // Auto-play on load
    video.play().catch(() => {});

    const onTimeUpdate = () => {
      const duration = video.duration;
      const currentTime = video.currentTime;
      if (hasAutoScrolledRef.current) return;
      if (duration && !Number.isNaN(duration) && currentTime >= duration * AUTO_SCROLL_AT) {
        hasAutoScrolledRef.current = true;
        clearInterval(intervalId);
        requestAnimationFrame(() => {
          about.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);

    const typewriterTick = () => {
      const duration = video.duration;
      const currentTime = video.currentTime;
      if (!duration || Number.isNaN(duration)) return;
      const progress = Math.min(1, currentTime / (duration * TYPING_END_AT));
      const line1End = 0.06;
      const target1 = progress <= line1End
        ? Math.floor((progress / line1End) * TYPEWRITER_LINE1.length)
        : TYPEWRITER_LINE1.length;
      const target2 = line2UnlockedRef.current
        ? Math.floor(((progress - line1End) / (1 - line1End)) * TYPEWRITER_LINE2.length)
        : 0;
      setVisibleChars1((prev) => Math.min(target1, prev + 1));
      setVisibleChars2((prev) => Math.min(target2, prev + 1));
    };
    const intervalId = window.setInterval(typewriterTick, CHAR_INTERVAL_MS);
    intervalIdRef.current = intervalId;

    return () => {
      window.removeEventListener("wheel", blockScroll);
      window.removeEventListener("touchmove", blockScroll);
      video.removeEventListener("timeupdate", onTimeUpdate);
      clearInterval(intervalId);
      intervalIdRef.current = null;
    };
  }, [entrySection]);

  const handleSkipIntro = () => {
    hasAutoScrolledRef.current = true;
    scrollLockedRef.current = true;

    if (intervalIdRef.current != null) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
    }

    const about = aboutRef.current;
    if (about) about.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="home-page">
      <section className="home-video-section">
        <video
          ref={videoRef}
          className="home-video"
          src={VIDEO_PATH}
          muted
          playsInline
          preload="auto"
        />
        <div className="home-video-overlay">
          <div className="home-typewriter-block">
            <div className="home-typewriter-line">
              {TYPEWRITER_LINE1.slice(0, visibleChars1)}
              {visibleChars1 < TYPEWRITER_LINE1.length && (
                <span className="home-typewriter-cursor">|</span>
              )}
            </div>
            <div className="home-typewriter-line home-typewriter-line-sub">
              {TYPEWRITER_LINE2.slice(0, visibleChars2)}
              {visibleChars2 > 0 && visibleChars2 < TYPEWRITER_LINE2.length && (
                <span className="home-typewriter-cursor">|</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="home-skip-intro-btn"
            onClick={handleSkipIntro}
          >
            Skip intro
          </button>
        </div>
      </section>
      <div ref={aboutRef} className="home-about-section">
        <div
          className="home-about-phrase-grid"
          aria-hidden="true"
          style={{ ["--phrase-slot" as any]: "7.2s" }}
        >
          <span
            key={aboutPhraseIndex}
            className="home-about-phrase"
            style={{
              ["--phrase-rgb" as any]: ABOUT_PHRASES[aboutPhraseIndex]?.rgb,
              ["--phrase-scale" as any]: ABOUT_PHRASES[aboutPhraseIndex]?.scale ?? 1,
            }}
          >
            {ABOUT_PHRASES[aboutPhraseIndex]?.text}
          </span>
        </div>
        <div className="home-about-inner">
          <h1 className="home-about-title">
            Welcome <span className="home-about-title-blue">to</span>{" "}
            <span className="home-about-title-gold">Infinite</span>{" "}
            <span className="home-about-title-gold">Monkeys</span>
          </h1>
          <p className="home-about-text">
            Give infinite monkeys infinite typewriters — one document at a time.
            <br />
            Select text, summon the monkeys, and watch ideas take new shape.
          </p>
          <button
            type="button"
            className="home-about-cta-btn"
            onClick={() =>
              deskRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            aria-label="Let's go to desk section"
          >
            <span aria-hidden="true">Let&apos;s Go</span>
          </button>

          {/* Infinity moved outside .home-about-inner to position relative to .home-about-section */}
        </div>
        <div className="home-about-panels" aria-label="About panels">
          {ABOUT_PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`home-about-panel${
                activePanel === p.id ? " is-active" : activePanel != null ? " is-dim" : ""
              }`}
              data-panel={p.id}
              onPointerEnter={() => {
                if (!tapMode) setActivePanel(p.id);
              }}
              onPointerLeave={() => {
                if (!tapMode) setActivePanel(null);
              }}
              onClick={() => {
                if (!tapMode) return;
                setActivePanel((prev) => (prev === p.id ? null : p.id));
              }}
              aria-label={`${p.title}`}
            >
              <div className="home-about-panel-content">
                <div className="home-about-panel-header">
                  <span className="home-about-panel-number">{p.id}</span>
                  <span className="home-about-panel-title">{p.title}</span>
                </div>
                <p className="home-about-panel-desc">{renderAboutPanelDesc(p.desc)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* No scroll arrows: panels themselves anchor the About section. */}
      </div>

      <div ref={deskRef} className="home-desk-section">
        <Scene3D />
        <div className="home-content">
          <h1 className="home-title">
            <span>Infinite</span>
            <span className="home-title-second">Monkeys</span>
          </h1>
          <p
            className="home-explore-hint"
            aria-label="Explore the desk to discover interactive elements"
          >
            Explore{" "}
            <span className="home-explore-arrow" aria-hidden="true">
              →
            </span>{" "}
            the desk
          </p>
          <Link to="/docs" className="home-cta">
            Enter the drive
          </Link>
          <button
            type="button"
            className="home-back-btn"
            onClick={() =>
              aboutRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            aria-label="Back to About Infinite Monkeys section"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
