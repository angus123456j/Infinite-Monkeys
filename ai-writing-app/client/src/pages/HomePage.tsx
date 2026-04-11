import { Link, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createDoc } from "../lib/docs";

const VIDEO_PATH = "/models/monkeyvid.mp4";
/** Swap to `/videos/product-demo.mp4` after adding `client/public/videos/product-demo.mp4`. */
const HERO_DEMO_VIDEO = VIDEO_PATH;
const AUTO_SCROLL_AT = 0.9;
const TYPEWRITER_LINE1 = "Infinite drafts. One perfect sentence.";
const TYPEWRITER_LINE2 = "Write alongside infinite minds.";
const TYPING_END_AT = 0.75;
const CHAR_INTERVAL_MS = 40;

const ABOUT_HEADLINE_LINE = "What is";
const ABOUT_HEADLINE_ACCENT = "this?";

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

type HomeLocationState = { skipIntro?: boolean };

function shouldSkipIntroVideo(
  searchParams: URLSearchParams,
  locationState: unknown
): boolean {
  if (searchParams.get("skipIntro") === "1") return true;
  if (searchParams.get("section") === "about") return true;
  return (locationState as HomeLocationState | null)?.skipIntro === true;
}

/**
 * Landing page: full-screen intro video + typewriter, then main content (no WebGL desk).
 */
export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const scrollLockedRef = useRef(true);
  const hasAutoScrolledRef = useRef(false);
  const finishIntroRef = useRef<(() => void) | null>(null);
  /** When true, intro is removed from the DOM so users cannot scroll back to it. */
  const [introDone, setIntroDone] = useState(() =>
    shouldSkipIntroVideo(searchParams, location.state)
  );
  const [visibleChars1, setVisibleChars1] = useState(0);
  const [visibleChars2, setVisibleChars2] = useState(0);
  const [aboutIntroVisible, setAboutIntroVisible] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [startWritingPending, setStartWritingPending] = useState(false);
  const line2UnlockedRef = useRef(false);

  async function handleStartWriting() {
    if (startWritingPending) return;
    setStartWritingPending(true);
    try {
      const meta = await createDoc({ title: "Untitled document" });
      navigate(`/doc/${meta.id}`);
    } catch (err) {
      console.error("Failed to create document:", err);
      navigate("/docs");
    } finally {
      setStartWritingPending(false);
    }
  }

  useEffect(() => {
    if (visibleChars1 >= TYPEWRITER_LINE1.length) line2UnlockedRef.current = true;
  }, [visibleChars1]);

  useEffect(() => {
    if (shouldSkipIntroVideo(searchParams, location.state)) {
      setIntroDone(true);
    }
  }, [searchParams, location.state, location.key]);

  useEffect(() => {
    if (!introDone) return;
    if (searchParams.get("section") === "about") return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [introDone, searchParams]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "about" && aboutRef.current) {
      hasAutoScrolledRef.current = true;
      scrollLockedRef.current = false;
      setIntroDone(true);
      videoRef.current?.pause();
      aboutRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = aboutRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setAboutIntroVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (introDone) return;

    const video = videoRef.current;
    if (!video || !contentRef.current) return;

    const blockScroll = (e: Event) => {
      if (scrollLockedRef.current) e.preventDefault();
    };
    window.addEventListener("wheel", blockScroll, { passive: false });
    window.addEventListener("touchmove", blockScroll, { passive: false });

    void video.play().catch(() => {});

    const typewriterTick = () => {
      const duration = video.duration;
      const currentTime = video.currentTime;
      if (!duration || Number.isNaN(duration)) return;
      const progress = Math.min(1, currentTime / (duration * TYPING_END_AT));
      const line1End = 0.06;
      const target1 =
        progress <= line1End
          ? Math.floor((progress / line1End) * TYPEWRITER_LINE1.length)
          : TYPEWRITER_LINE1.length;
      const target2 = line2UnlockedRef.current
        ? Math.floor(((progress - line1End) / (1 - line1End)) * TYPEWRITER_LINE2.length)
        : 0;
      setVisibleChars1((prev) => Math.min(target1, prev + 1));
      setVisibleChars2((prev) => Math.min(target2, prev + 1));
    };

    const intervalId = window.setInterval(typewriterTick, CHAR_INTERVAL_MS);

    const finishIntro = () => {
      if (hasAutoScrolledRef.current) return;
      hasAutoScrolledRef.current = true;
      window.clearInterval(intervalId);
      scrollLockedRef.current = false;
      video.pause();

      const content = contentRef.current;
      if (!content) {
        setIntroDone(true);
        requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
        return;
      }

      const removeIntroAndAlignScroll = () => {
        setIntroDone(true);
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        });
      };

      let fallbackId: number | null = null;
      let transitionFinished = false;

      const done = () => {
        if (transitionFinished) return;
        transitionFinished = true;
        window.removeEventListener("scrollend", onScrollEnd);
        if (fallbackId !== null) {
          window.clearTimeout(fallbackId);
          fallbackId = null;
        }
        removeIntroAndAlignScroll();
      };

      function onScrollEnd() {
        done();
      }

      content.scrollIntoView({ behavior: "smooth", block: "start" });
      window.addEventListener("scrollend", onScrollEnd);
      fallbackId = window.setTimeout(done, 1200);
    };
    finishIntroRef.current = finishIntro;

    const onTimeUpdate = () => {
      const duration = video.duration;
      const currentTime = video.currentTime;
      if (hasAutoScrolledRef.current) return;
      if (duration && !Number.isNaN(duration) && currentTime >= duration * AUTO_SCROLL_AT) {
        finishIntro();
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      finishIntroRef.current = null;
      window.removeEventListener("wheel", blockScroll);
      window.removeEventListener("touchmove", blockScroll);
      video.removeEventListener("timeupdate", onTimeUpdate);
      window.clearInterval(intervalId);
    };
  }, [introDone]);

  return (
    <div className="home-page home-page--modern">
      {!introDone && (
        <section className="home-video-section" aria-label="Intro">
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
          </div>
          <div className="home-video-skip-wrap">
            <button
              type="button"
              className="home-skip-intro"
              onClick={() => finishIntroRef.current?.()}
              aria-label="Skip intro and go to main content"
            >
              Skip intro
            </button>
          </div>
        </section>
      )}

      <div ref={contentRef} className="home-post-intro">
        <header className="home-nav" aria-label="Site">
          <div className="home-nav-inner">
            <span className="home-nav-brand">
              <span className="home-nav-brand-main">Infinite</span>{" "}
              <span className="home-nav-brand-accent">Monkeys</span>
            </span>
            <nav className="home-nav-links">
              <Link to="/docs" className="home-nav-link">
                Drive
              </Link>
              <Link to="/monkey-agents-network" className="home-nav-link">
                Agents
              </Link>
              <Link to="/docs" className="home-nav-cta">
                Open app
              </Link>
            </nav>
          </div>
        </header>

        <section className="home-hero-section" aria-labelledby="home-hero-heading">
          <div className="home-shell home-hero-grid">
            <div className="home-hero-copy">
              <p className="home-hero-eyebrow">Writing workspace</p>
              <h1 id="home-hero-heading" className="home-hero-title">
                <span className="home-hero-title-line">Infinite</span>{" "}
                <span className="home-hero-title-accent">Monkeys</span>
              </h1>
              <p className="home-hero-lead">
                <strong>
                  A new writing medium shaped by specialist agents and your own context.
                </strong>
              </p>
              <div className="home-hero-actions">
                <button
                  type="button"
                  className="home-hero-cta primary"
                  onClick={handleStartWriting}
                  disabled={startWritingPending}
                  aria-busy={startWritingPending}
                >
                  {startWritingPending ? "Opening…" : "Start writing"}
                </button>
                <Link to="/monkey-agents-network" className="home-hero-cta secondary">
                  Browse agents
                </Link>
              </div>
              <p className="home-hero-subline">
                Highlight text, summon specialist agents, and pull from a context library that
                travels with your writing.
              </p>
            </div>
            <div className="home-hero-demo">
              <video
                className="home-hero-demo-video"
                controls
                playsInline
                preload="metadata"
                aria-label="Product demo video"
              >
                <source src={HERO_DEMO_VIDEO} type="video/mp4" />
              </video>
            </div>
          </div>
        </section>

        <div
          ref={aboutRef}
          id="about"
          className="home-about-section home-about-section--wave"
        >
          <div className="home-shell home-about-wave-inner">
            <div
              className={`home-about-intro${aboutIntroVisible ? " home-about-intro--visible" : ""}`}
            >
              <p className="home-about-eyebrow">Learn more</p>
              <h2 className="home-about-display" aria-label={`${ABOUT_HEADLINE_LINE} ${ABOUT_HEADLINE_ACCENT}`}>
                <span aria-hidden className="home-about-display-line">
                  {ABOUT_HEADLINE_LINE.split("").map((ch, i) => (
                    <span
                      key={`about-h1-${i}`}
                      className="home-about-display-char"
                      style={{ "--char-i": i } as CSSProperties}
                    >
                      {ch === " " ? "\u00a0" : ch}
                    </span>
                  ))}
                </span>
                <span
                  aria-hidden
                  className="home-about-display-char home-about-display-char--gap"
                  style={{ "--char-i": ABOUT_HEADLINE_LINE.length } as CSSProperties}
                >
                  {"\u00a0"}
                </span>
                <span aria-hidden className="home-about-display-accent">
                  {ABOUT_HEADLINE_ACCENT.split("").map((ch, i) => (
                    <span
                      key={`about-h2-${i}`}
                      className="home-about-display-char"
                      style={
                        {
                          "--char-i": ABOUT_HEADLINE_LINE.length + 1 + i,
                        } as CSSProperties
                      }
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              </h2>
              <p className="home-about-lead">
                A document-first editor with a context library and reusable monkey agents—so
                each pass stays on-brief instead of drifting into generic polish.
              </p>
            </div>

            <div className="home-about-accordion" aria-label="About Infinite Monkeys">
              {ABOUT_PANELS.map((p) => (
                <details key={p.id} name="about-panels" className="home-about-accordion-item">
                  <summary className="home-about-accordion-summary">{p.title}</summary>
                  <div className="home-about-accordion-body">
                    <p className="home-about-accordion-text">{p.desc}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>

        <section className="home-bottom-hero" aria-label="Infinite monkey theorem">
          <div className="home-bottom-hero-inner">
            <blockquote
              className="home-bottom-hero-quote"
              cite="https://en.wikipedia.org/wiki/Infinite_monkey_theorem"
            >
              <p>
                The infinite monkey theorem holds that a monkey striking keys at random on a
                typewriter for an endless duration would, with probability one, eventually produce
                any finite text—{" "}
                <span lang="la">Hamlet</span>, a proof, a laundry list—hidden somewhere in the
                unbounded stream of letters; in any mortal span the odds remain vanishingly small,
                yet the image endures: infinity, chance, and the stubborn idea that given long
                enough, even noise might stumble into sense.
              </p>
            </blockquote>
          </div>
        </section>
      </div>
    </div>
  );
}
