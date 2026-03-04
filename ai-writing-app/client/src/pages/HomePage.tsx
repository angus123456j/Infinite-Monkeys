import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Scene3D from "../components/Scene3D";

const VIDEO_PATH = "/models/monkeyvid.mp4";
const AUTO_SCROLL_AT = 0.9;
const TYPEWRITER_LINE1 = "Infinite drafts. One perfect sentence.";
const TYPEWRITER_LINE2 = "Write alongside infinite minds.";
const TYPING_END_AT = 0.75;
const CHAR_INTERVAL_MS = 40; // one char every 40ms ≈ 25 chars/sec

export default function HomePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollLockedRef = useRef(true);
  const hasAutoScrolledRef = useRef(false);
  const [visibleChars1, setVisibleChars1] = useState(0);
  const [visibleChars2, setVisibleChars2] = useState(0);
  const line2UnlockedRef = useRef(false);

  useEffect(() => {
    if (visibleChars1 >= TYPEWRITER_LINE1.length) line2UnlockedRef.current = true;
  }, [visibleChars1]);

  useEffect(() => {
    const video = videoRef.current;
    const content = contentRef.current;
    if (!video || !content) return;

    // Block user scroll during video
    const blockScroll = (e: Event) => {
      if (scrollLockedRef.current) e.preventDefault();
    };
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
          content.scrollIntoView({ behavior: "smooth", block: "start" });
          let released = false;
          const releaseLock = () => {
            if (released) return;
            released = true;
            scrollLockedRef.current = false;
            window.removeEventListener("scrollend", onScrollEnd);
            clearTimeout(fallbackId);
          };
          const onScrollEnd = () => releaseLock();
          window.addEventListener("scrollend", onScrollEnd);
          const fallbackId = setTimeout(releaseLock, 1200);
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
    const intervalId = setInterval(typewriterTick, CHAR_INTERVAL_MS);

    return () => {
      window.removeEventListener("wheel", blockScroll);
      window.removeEventListener("touchmove", blockScroll);
      video.removeEventListener("timeupdate", onTimeUpdate);
      clearInterval(intervalId);
    };
  }, []);

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
        </div>
      </section>
      <div ref={contentRef} className="home-content-section">
        <Scene3D />
        <div className="home-content">
          <h1 className="home-title">
            <span>Infinite</span>
            <span className="home-title-second">Monkeys</span>
          </h1>
          <p className="home-tagline">
            Give infinite monkeys infinite typewriters — one document at a time.
          </p>
          <p className="home-explore-hint" aria-label="Explore the desk to discover interactive elements">
            Explore <span className="home-explore-arrow" aria-hidden="true">→</span> the desk
          </p>
          <p className="home-desc">
            A writing space where AI helps you rewrite, refine, and reimagine your words.
            Select text, summon the monkeys, and watch ideas take new shape.
          </p>
          <Link to="/docs" className="home-cta">
            Try it
          </Link>
        </div>
      </div>
    </div>
  );
}
