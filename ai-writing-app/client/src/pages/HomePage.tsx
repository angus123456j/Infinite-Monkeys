import { Link, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { supabase } from "../lib/supabase";
import Seo from "../components/Seo";

const VIDEO_PATH = "/models/monkeyvid.mp4";
const HERO_DEMO_VIDEO_PATH = "/videos/beautifuldemo.mp4";

/** `min:sec:ms` → seconds for `<video>.currentTime` (last part is milliseconds). */
function heroChapterSeconds(min: number, sec: number, ms: number): number {
  return min * 60 + sec + ms / 1000;
}

/** Hero demo chapter markers (`beautifuldemo.mp4`). */
const HERO_DEMO_CHAPTERS: Array<{ label: string; t: number }> = [
  { label: "AI rewrite", t: heroChapterSeconds(0, 5, 3) },
  { label: "Timeline", t: heroChapterSeconds(0, 14, 22) },
  { label: "Editor", t: heroChapterSeconds(0, 19, 6) },
  { label: "Themes", t: heroChapterSeconds(0, 22, 24) },
  { label: "AI Expansion", t: heroChapterSeconds(0, 31, 8) },
  { label: "AI Detector", t: heroChapterSeconds(0, 42, 25) },
  { label: "Context Library", t: heroChapterSeconds(0, 53, 5) },
  { label: "Monkey Agents", t: heroChapterSeconds(1, 12, 19) },
  { label: "Agent Net", t: heroChapterSeconds(1, 42, 10) },
];

type HeroChapterSegment = { label: string; start: number; end: number };

function buildHeroChapterSegments(
  chapters: Array<{ label: string; t: number }>,
  duration: number
): HeroChapterSegment[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const sorted = [...chapters].sort((a, b) => a.t - b.t);
  const out: HeroChapterSegment[] = [];
  if (sorted[0]!.t > 0.02) {
    out.push({ label: "", start: 0, end: sorted[0]!.t });
  }
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!.t;
    const rawEnd = i + 1 < sorted.length ? sorted[i + 1]!.t : duration;
    const end = Math.min(Math.max(rawEnd, start + 0.001), duration);
    out.push({ label: sorted[i]!.label, start, end });
  }
  return out.filter((s) => s.end > s.start + 0.0005);
}

function formatHeroClock(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function heroSegmentFillRatio(seg: HeroChapterSegment, t: number): number {
  if (t <= seg.start) return 0;
  if (t >= seg.end) return 1;
  return (t - seg.start) / (seg.end - seg.start);
}

const HERO_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const HERO_CHROME_HIDE_MS = 3200;

const THINKING_MONKEY_PATH = "/images/thinkingmonkey.png";
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

The unique aspect is its integration with the Context Library and Monkey Agents, offering persistent memory and specialized capabilities. This means you avoid generic polish when your goal is craft, clarity, and control. Because expert agents handle every task and detail, you gain confidence and creative freedom, knowing you steer the true direction.`,
  },
  {
    id: 2,
    title: "Context Library",

    desc: `Contexts are reusable blocks of information you want the model to work from. That could be research papers, your resume, a grading rubric, an essay structure, notes, or even raw background info.
    
Instead of re-explaining everything every time, you attach the relevant context and the model uses it as its source of truth while writing or rewriting.

This is how you avoid generic output. The model is not guessing anymore, it is grounded in your actual material, your constraints, and the exact information you care about.`,
  },
  {
    id: 3,
    title: "Monkey Agents",
    desc: `One assistant can’t be best at everything. Agents are specialists in diction, dialogue, continuity, structure, and careful tightening, each with its own role, behavior, and limits. Swap agents on the same selection to compare real alternatives, not one in-house style.

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
  const heroDemoVideoRef = useRef<HTMLVideoElement>(null);
  const heroMediaRef = useRef<HTMLDivElement>(null);
  const [heroDuration, setHeroDuration] = useState(0);
  const [heroCurrentTime, setHeroCurrentTime] = useState(0);
  const [heroPlaying, setHeroPlaying] = useState(false);
  const [heroMuted, setHeroMuted] = useState(false);
  const [heroVolume, setHeroVolume] = useState(1);
  const [heroPlaybackRate, setHeroPlaybackRate] = useState(1);
  const [heroSettingsOpen, setHeroSettingsOpen] = useState(false);
  const heroSettingsRef = useRef<HTMLDivElement>(null);
  const [heroChromeHidden, setHeroChromeHidden] = useState(false);
  const [heroIsFullscreen, setHeroIsFullscreen] = useState(false);
  const heroIdleTimerRef = useRef<number | null>(null);
  const heroPlayingRef = useRef(false);

  const heroSegments = useMemo(
    () => buildHeroChapterSegments(HERO_DEMO_CHAPTERS, heroDuration),
    [heroDuration]
  );

  const heroActiveChapterLabel = useMemo(() => {
    const t = heroCurrentTime;
    for (let i = heroSegments.length - 1; i >= 0; i--) {
      const s = heroSegments[i]!;
      if (t + 1e-4 >= s.start) return s.label.trim() || "Intro";
    }
    return "Intro";
  }, [heroCurrentTime, heroSegments]);

  useEffect(() => {
    const v = heroDemoVideoRef.current;
    if (!v) return;
    const sync = () => {
      setHeroCurrentTime(v.currentTime);
      setHeroPlaying(!v.paused);
      setHeroMuted(v.muted);
      setHeroVolume(v.volume);
      setHeroPlaybackRate(v.playbackRate);
    };
    const onDur = () =>
      setHeroDuration(
        Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
      );
    v.addEventListener("timeupdate", sync);
    v.addEventListener("seeking", sync);
    v.addEventListener("seeked", sync);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("play", sync);
    v.addEventListener("pause", sync);
    v.addEventListener("volumechange", sync);
    v.addEventListener("ratechange", sync);
    onDur();
    sync();
    return () => {
      v.removeEventListener("timeupdate", sync);
      v.removeEventListener("seeking", sync);
      v.removeEventListener("seeked", sync);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("play", sync);
      v.removeEventListener("pause", sync);
      v.removeEventListener("volumechange", sync);
      v.removeEventListener("ratechange", sync);
    };
  }, []);

  useEffect(() => {
    if (!heroSettingsOpen) return;
    const close = (e: Event) => {
      const el = heroSettingsRef.current;
      if (el && !el.contains(e.target as Node)) setHeroSettingsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [heroSettingsOpen]);

  useEffect(() => {
    heroPlayingRef.current = heroPlaying;
  }, [heroPlaying]);

  const clearHeroIdleTimer = useCallback(() => {
    if (heroIdleTimerRef.current != null) {
      clearTimeout(heroIdleTimerRef.current);
      heroIdleTimerRef.current = null;
    }
  }, []);

  const bumpHeroChromeActivity = useCallback(() => {
    setHeroChromeHidden(false);
    clearHeroIdleTimer();
    if (!heroPlayingRef.current) return;
    heroIdleTimerRef.current = window.setTimeout(() => {
      setHeroChromeHidden(true);
      heroIdleTimerRef.current = null;
    }, HERO_CHROME_HIDE_MS);
  }, [clearHeroIdleTimer]);

  useEffect(() => {
    if (!heroPlaying) {
      clearHeroIdleTimer();
      setHeroChromeHidden(false);
      return;
    }
    bumpHeroChromeActivity();
    return () => {
      clearHeroIdleTimer();
    };
  }, [heroPlaying, bumpHeroChromeActivity, clearHeroIdleTimer]);

  useEffect(() => {
    if (heroSettingsOpen) {
      clearHeroIdleTimer();
      setHeroChromeHidden(false);
    } else if (heroPlayingRef.current) {
      bumpHeroChromeActivity();
    }
  }, [heroSettingsOpen, bumpHeroChromeActivity, clearHeroIdleTimer]);

  useEffect(() => {
    const syncFs = () => {
      setHeroIsFullscreen(document.fullscreenElement === heroMediaRef.current);
    };
    document.addEventListener("fullscreenchange", syncFs);
    syncFs();
    return () => document.removeEventListener("fullscreenchange", syncFs);
  }, []);

  const toggleHeroPlay = useCallback(() => {
    const el = heroDemoVideoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => bumpHeroChromeActivity());
    } else {
      el.pause();
      bumpHeroChromeActivity();
    }
  }, [bumpHeroChromeActivity]);

  const toggleHeroMute = useCallback(() => {
    const el = heroDemoVideoRef.current;
    if (!el) return;
    if (el.muted) {
      el.muted = false;
      if (el.volume < 0.05) {
        el.volume = 0.6;
        setHeroVolume(0.6);
      }
    } else {
      el.muted = true;
    }
    setHeroMuted(el.muted);
    bumpHeroChromeActivity();
  }, [bumpHeroChromeActivity]);

  const onHeroVolumeInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const el = heroDemoVideoRef.current;
      if (!el) return;
      const vol = Number(e.target.value);
      el.volume = vol;
      el.muted = vol < 0.001;
      setHeroVolume(vol);
      setHeroMuted(el.muted);
      bumpHeroChromeActivity();
    },
    [bumpHeroChromeActivity]
  );

  const pickHeroPlaybackRate = useCallback(
    (rate: number) => {
      const el = heroDemoVideoRef.current;
      if (!el) return;
      el.playbackRate = rate;
      setHeroPlaybackRate(rate);
      setHeroSettingsOpen(false);
      bumpHeroChromeActivity();
    },
    [bumpHeroChromeActivity]
  );

  const toggleHeroFullscreen = useCallback(() => {
    const shell = heroMediaRef.current;
    if (!shell) return;
    if (!document.fullscreenElement) void shell.requestFullscreen();
    else void document.exitFullscreen();
    bumpHeroChromeActivity();
  }, [bumpHeroChromeActivity]);

  const onHeroSegmentClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>, seg: HeroChapterSegment) => {
      const el = heroDemoVideoRef.current;
      if (!el) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio =
        rect.width > 0
          ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
          : 0;
      el.currentTime = seg.start + ratio * (seg.end - seg.start);
      bumpHeroChromeActivity();
    },
    [bumpHeroChromeActivity]
  );
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

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user;
      if (u && !u.is_anonymous) navigate("/drive", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user;
      if (u && !u.is_anonymous) navigate("/drive", { replace: true });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function handleStartWriting() {
    if (startWritingPending) return;
    setStartWritingPending(true);
    navigate("/trial", { state: { autoIntro: true } });
    // Allow route transition to complete before clearing pending.
    requestAnimationFrame(() => setStartWritingPending(false));
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
    // Once the intro is complete, replace the history entry with skipIntro=1
    // so browser back from /doc/:id doesn't replay the intro video.
    if (searchParams.get("skipIntro") !== "1") {
      navigate("/?skipIntro=1", { replace: true, state: { skipIntro: true } });
    }
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [introDone, searchParams, navigate]);

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
        return;
      }

      const removeIntroAndAlignScroll = () => {
        setIntroDone(true);
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
      <Seo
        title="Infinite Monkeys — AI writing agents for rewrites"
        description="Infinite Monkeys is an AI writing app with specialist monkeys (agents) for rewrites, expansion, detection, and context-aware editing."
        canonicalUrl="https://www.infinitemonkeys.world/"
      />
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
                <Link
                  to="/signup"
                  className="home-hero-cta secondary home-hero-cta--signup"
                >
                  <span className="home-hero-cta--signup-label">Sign Up</span>
                </Link>
              </div>
              <p className="home-hero-loginline">
                <span>Already made an account</span>
                <span className="home-hero-loginarrow" aria-hidden />
                <Link to="/login" className="home-hero-loginbtn">
                  Log in
                </Link>
              </p>
              <p className="home-hero-subline">
                Highlight text, summon specialist agents, and pull from a context library that
                travels with your writing.
              </p>
            </div>
            <div className="home-hero-demo home-hero-demo-video-wrap" aria-label="Product demo">
              <div
                ref={heroMediaRef}
                className="home-hero-demo-media"
                onMouseMove={bumpHeroChromeActivity}
                onTouchStart={bumpHeroChromeActivity}
              >
                <video
                  ref={heroDemoVideoRef}
                  className="home-hero-demo-video"
                  src={HERO_DEMO_VIDEO_PATH}
                  playsInline
                  controls={false}
                  preload="metadata"
                  onClick={toggleHeroPlay}
                />
                <div
                  className={`home-hero-demo-chrome${heroChromeHidden ? " home-hero-demo-chrome--hidden" : ""}`}
                  aria-label="Video controls"
                >
                  <div
                    className="home-hero-demo-timeline"
                    role="group"
                    aria-label="Chapter timeline"
                  >
                    {heroSegments.length === 0 ? (
                      <div className="home-hero-demo-timeline-waiting" aria-hidden />
                    ) : null}
                    {heroSegments.map((seg, i) => {
                      const dur = seg.end - seg.start;
                      const fill = heroSegmentFillRatio(seg, heroCurrentTime);
                      const tip = seg.label.trim() || "Intro";
                      return (
                        <button
                          key={`hero-seg-${i}-${seg.start}`}
                          type="button"
                          className="home-hero-demo-segment"
                          style={{ flexGrow: Math.max(dur, 0.05) }}
                          data-segment-tip={tip}
                          aria-label={`${tip}, ${formatHeroClock(seg.start)} to ${formatHeroClock(seg.end)}`}
                          onClick={(e) => onHeroSegmentClick(e, seg)}
                        >
                          <span className="home-hero-demo-segment-track" aria-hidden />
                          <span
                            className="home-hero-demo-segment-fill"
                            style={{ transform: `scaleX(${fill})` }}
                            aria-hidden
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="home-hero-demo-controls-row">
                    <button
                      type="button"
                      className="home-hero-demo-play"
                      onClick={toggleHeroPlay}
                      aria-label={heroPlaying ? "Pause" : "Play"}
                    >
                      {heroPlaying ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                          <path fill="currentColor" d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <div className="home-hero-demo-volume">
                      <button
                        type="button"
                        className="home-hero-demo-iconbtn"
                        onClick={toggleHeroMute}
                        aria-label={heroMuted ? "Unmute" : "Mute"}
                      >
                        {heroMuted ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
                            />
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                            />
                          </svg>
                        )}
                      </button>
                      <div className="home-hero-demo-volume-rail">
                        <label htmlFor="hero-demo-volume" className="home-hero-demo-sr-only">
                          Volume
                        </label>
                        <input
                          id="hero-demo-volume"
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={heroMuted ? 0 : heroVolume}
                          onChange={onHeroVolumeInput}
                          className="home-hero-demo-volume-range"
                          aria-valuemin={0}
                          aria-valuemax={1}
                          aria-valuenow={heroMuted ? 0 : heroVolume}
                          aria-valuetext={`${Math.round((heroMuted ? 0 : heroVolume) * 100)}%`}
                        />
                      </div>
                    </div>
                    <span className="home-hero-demo-time" aria-live="polite">
                      {formatHeroClock(heroCurrentTime)} / {formatHeroClock(heroDuration)}
                    </span>
                    <span
                      className="home-hero-demo-chapter-pill"
                      title={heroActiveChapterLabel}
                      aria-label={`Current chapter: ${heroActiveChapterLabel}`}
                    >
                      {heroActiveChapterLabel}
                    </span>
                    <div className="home-hero-demo-trailing">
                      <div ref={heroSettingsRef} className="home-hero-demo-settings">
                        <button
                          type="button"
                          className="home-hero-demo-iconbtn home-hero-demo-settings-btn"
                          aria-expanded={heroSettingsOpen}
                          aria-haspopup="true"
                          aria-label={`Playback speed, currently ${heroPlaybackRate}×`}
                          onClick={() => {
                            setHeroSettingsOpen((o) => !o);
                            bumpHeroChromeActivity();
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.13-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                            />
                          </svg>
                        </button>
                        {heroSettingsOpen ? (
                          <div className="home-hero-demo-settings-pop" role="menu">
                            <div className="home-hero-demo-settings-heading" role="presentation">
                              Speed
                            </div>
                            {HERO_PLAYBACK_RATES.map((r) => {
                              const active =
                                Math.abs(heroPlaybackRate - r) < 0.001;
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={active}
                                  className={
                                    active
                                      ? "home-hero-demo-settings-opt is-active"
                                      : "home-hero-demo-settings-opt"
                                  }
                                  onClick={() => pickHeroPlaybackRate(r)}
                                >
                                  {r === 1 ? "Normal (1×)" : `${r}×`}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="home-hero-demo-iconbtn"
                        onClick={toggleHeroFullscreen}
                        aria-label={
                          heroIsFullscreen ? "Exit fullscreen" : "Fullscreen"
                        }
                      >
                        {heroIsFullscreen ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
                            />
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div
          ref={aboutRef}
          id="about"
          className="home-about-section home-about-section--wave"
        >
          <img
            className="home-about-thinking-monkey"
            src={THINKING_MONKEY_PATH}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
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
              A document-first editor featuring a context library and reusable monkey agents,
              so each pass remains aligned with the brief without slipping into generic polish.
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
              The infinite monkey theorem says a monkey typing forever would eventually produce any text, such as Hamlet or a laundry list, buried in endless random characters. In a human lifetime, the odds are minuscule, 
              but the idea is compelling: writing becomes discovery, not creation, as if we are searching through infinite noise for something already there. - Monkey 313
              </p>
            </blockquote>
          </div>
        </section>
      </div>
    </div>
  );
}
