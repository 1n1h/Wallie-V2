import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const INJECTED_STYLES = `
  .gsap-reveal { visibility: hidden; }

  .film-grain {
    position: absolute; inset: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 50; opacity: 0.05; mix-blend-mode: overlay;
    background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%25" height="100%25" filter="url(%23noiseFilter)"/></svg>');
  }

  .bg-grid-theme {
    background-size: 60px 60px;
    background-image:
      linear-gradient(to right, rgba(0, 108, 237, 0.06) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0, 108, 237, 0.06) 1px, transparent 1px);
    mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  }

  .text-3d-matte {
    color: #f1f1f4;
    text-shadow:
      0 10px 30px rgba(0, 108, 237, 0.25),
      0 2px 4px rgba(0, 108, 237, 0.15);
  }

  .text-silver-matte {
    background: linear-gradient(180deg, #f1f1f4 0%, rgba(0, 108, 237, 0.5) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    transform: translateZ(0);
    filter:
      drop-shadow(0px 10px 20px rgba(0, 108, 237, 0.2))
      drop-shadow(0px 2px 4px rgba(0, 108, 237, 0.15));
  }

  .text-card-silver-matte {
    background: linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    transform: translateZ(0);
    filter:
      drop-shadow(0px 12px 24px rgba(0,0,0,0.8))
      drop-shadow(0px 4px 8px rgba(0,0,0,0.6));
  }

  .premium-depth-card {
    background: linear-gradient(145deg, #1a1040 0%, #181819 100%);
    box-shadow:
      0 40px 100px -20px rgba(0, 0, 0, 0.9),
      0 20px 40px -20px rgba(0, 0, 0, 0.8),
      inset 0 1px 2px rgba(0, 108, 237, 0.2),
      inset 0 -2px 4px rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(0, 108, 237, 0.08);
    position: relative;
  }

  .card-sheen {
    position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 50;
    background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(0, 108, 237, 0.08) 0%, transparent 40%);
    mix-blend-mode: screen; transition: opacity 0.3s ease;
  }

  .iphone-bezel {
    background-color: #111;
    box-shadow:
      inset 0 0 0 2px #52525B,
      inset 0 0 0 7px #000,
      0 40px 80px -15px rgba(0,0,0,0.9),
      0 15px 25px -5px rgba(0,0,0,0.7);
    transform-style: preserve-3d;
  }

  .hardware-btn {
    background: linear-gradient(90deg, #404040 0%, #171717 100%);
    box-shadow:
      -2px 0 5px rgba(0,0,0,0.8),
      inset -1px 0 1px rgba(255,255,255,0.15),
      inset 1px 0 2px rgba(0,0,0,0.8);
    border-left: 1px solid rgba(255,255,255,0.05);
  }

  .screen-glare {
    background: linear-gradient(110deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 45%);
  }

  .widget-depth {
    background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
    box-shadow:
      0 10px 20px rgba(0,0,0,0.3),
      inset 0 1px 1px rgba(255,255,255,0.05),
      inset 0 -1px 1px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.03);
  }

  .floating-ui-badge {
    background: linear-gradient(135deg, rgba(0, 108, 237, 0.1) 0%, rgba(75, 147, 255, 0.05) 100%);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 0 0 1px rgba(0, 108, 237, 0.15),
      0 25px 50px -12px rgba(0, 0, 0, 0.8),
      inset 0 1px 1px rgba(255,255,255,0.2),
      inset 0 -1px 1px rgba(0,0,0,0.5);
  }

  .btn-modern-light, .btn-modern-dark {
    transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  }
  .btn-modern-light {
    background: linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%);
    color: #0F172A;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.1), 0 12px 24px -4px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }
  .btn-modern-light:hover {
    transform: translateY(-3px);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 6px 12px -2px rgba(0,0,0,0.15), 0 20px 32px -6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }
  .btn-modern-light:active {
    transform: translateY(1px);
    background: linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1), inset 0 3px 6px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(0,0,0,0.02);
  }
  .btn-modern-dark {
    background: linear-gradient(180deg, #27272A 0%, #18181B 100%);
    color: #FFFFFF;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.6), 0 12px 24px -4px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -3px 6px rgba(0,0,0,0.8);
  }
  .btn-modern-dark:hover {
    transform: translateY(-3px);
    background: linear-gradient(180deg, #3F3F46 0%, #27272A 100%);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 6px 12px -2px rgba(0,0,0,0.7), 0 20px 32px -6px rgba(0,0,0,1), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -3px 6px rgba(0,0,0,0.8);
  }
  .btn-modern-dark:active {
    transform: translateY(1px);
    background: #18181B;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.05), inset 0 3px 8px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(0,0,0,0.5);
  }

  .progress-ring {
    transform: rotate(-90deg);
    transform-origin: center;
    stroke-dasharray: 402;
    stroke-dashoffset: 402;
    stroke-linecap: round;
  }
`;

export default function CinematicHero({
  brandName = "Wallie",
  tagline1 = "Your AI-Powered",
  tagline2 = "Trading Companion.",
  cardHeading = "Intelligence, amplified.",
  cardDescription = (
    <>
      <span style={{ color: "#fff", fontWeight: 600 }}>Wallie AI</span> combines powerful language models with real-time web search to help you discuss charts, explore market topics, and learn about trading concepts.
    </>
  ),
  metricValue = 50,
  metricLabel = "Markets Covered",
  ctaHeading = "Start exploring today.",
  ctaDescription = "Join an active trading community using AI-powered discussion to learn and grow.",
  onGoogleLogin,
  onAppleLogin,
  onSignupClick,
}) {
  const containerRef = useRef(null);
  const mainCardRef = useRef(null);
  const mockupRef = useRef(null);
  const requestRef = useRef(0);

  // Mouse interaction
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (window.scrollY > window.innerHeight * 2) return;
      cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(() => {
        if (mainCardRef.current && mockupRef.current) {
          const rect = mainCardRef.current.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          mainCardRef.current.style.setProperty("--mouse-x", `${mouseX}px`);
          mainCardRef.current.style.setProperty("--mouse-y", `${mouseY}px`);
          const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
          const yVal = (e.clientY / window.innerHeight - 0.5) * 2;
          gsap.to(mockupRef.current, {
            rotationY: xVal * 12,
            rotationX: -yVal * 12,
            ease: "power3.out",
            duration: 1.2,
          });
        }
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // GSAP scroll timeline
  useEffect(() => {
    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      gsap.set(".text-track", { autoAlpha: 0, y: 60, scale: 0.85, filter: "blur(20px)", rotationX: -20 });
      gsap.set(".text-days", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".main-card", { y: window.innerHeight + 200, autoAlpha: 1 });
      gsap.set([".card-left-text", ".card-right-text", ".mockup-scroll-wrapper", ".floating-badge"], { autoAlpha: 0 });
      gsap.set(".cta-wrapper", { autoAlpha: 0, scale: 0.8, filter: "blur(30px)" });

      const introTl = gsap.timeline({ delay: 0.3 });
      introTl
        .to(".text-track", { duration: 1.8, autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", rotationX: 0, ease: "expo.out" })
        .to(".text-days", { duration: 1.4, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" }, "-=1.0");

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=3500",
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
        },
      });

      scrollTl
        .to([".hero-text-wrapper", ".bg-grid-theme"], { scale: 1.15, filter: "blur(20px)", opacity: 0.2, ease: "power2.inOut", duration: 1.5 }, 0)
        .to(".main-card", { y: 0, ease: "power3.inOut", duration: 1.5 }, 0)
        .to(".main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1 })
        .fromTo(".mockup-scroll-wrapper",
          { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.8 }, "-=0.5"
        )
        .fromTo(".floating-badge", { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 }, { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1, stagger: 0.15 }, "-=1")
        .fromTo(".card-left-text", { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1 }, "-=1")
        .fromTo(".card-right-text", { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1 }, "<")
        .to({}, { duration: 1 })
        .set(".hero-text-wrapper", { autoAlpha: 0 })
        .set(".cta-wrapper", { autoAlpha: 1 })
        .to({}, { duration: 0.5 })
        .to([".mockup-scroll-wrapper", ".floating-badge", ".card-left-text", ".card-right-text"], {
          scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: "power3.in", duration: 0.8, stagger: 0.05,
        })
        .to(".main-card", {
          width: isMobile ? "92vw" : "85vw",
          height: isMobile ? "92vh" : "85vh",
          borderRadius: isMobile ? "32px" : "40px",
          ease: "expo.inOut",
          duration: 1.2,
        }, "pullback")
        .to(".cta-wrapper", { scale: 1, filter: "blur(0px)", ease: "expo.inOut", duration: 1.2 }, "pullback")
        .to(".main-card", { y: -window.innerHeight - 300, ease: "power3.in", duration: 1 });
    }, containerRef);

    return () => ctx.revert();
  }, [metricValue]);

  const s = {
    container: {
      position: "relative",
      width: "100vw",
      height: "100vh",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', sans-serif",
      color: "#f1f1f4",
      perspective: "1500px",
    },
    gridOverlay: {
      position: "absolute",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      opacity: 0.5,
    },
    heroTextWrapper: {
      position: "absolute",
      zIndex: 10,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      width: "100vw",
      padding: "0 1rem",
      willChange: "transform",
    },
    tagline1: {
      fontSize: "clamp(1.9rem, 3.8vw, 2.6rem)",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      marginBottom: "0.5rem",
    },
    tagline2: {
      fontSize: "clamp(1.9rem, 3.8vw, 2.6rem)",
      fontWeight: 800,
      letterSpacing: "-0.03em",
    },
    ctaWrapper: {
      position: "absolute",
      zIndex: 10,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      width: "100vw",
      padding: "0 1rem",
      pointerEvents: "auto",
      willChange: "transform",
    },
    ctaHeading: {
      fontSize: "clamp(1.5rem, 3vw, 2rem)",
      fontWeight: 700,
      marginBottom: "1.5rem",
      letterSpacing: "-0.02em",
    },
    ctaDesc: {
      color: "rgba(255,255,255,0.5)",
      fontSize: "clamp(1rem, 1.5vw, 1.25rem)",
      marginBottom: "3rem",
      maxWidth: "36rem",
      margin: "0 auto 3rem",
      fontWeight: 300,
      lineHeight: 1.7,
    },
    ctaBtns: {
      display: "flex",
      flexWrap: "wrap",
      gap: "1.5rem",
      justifyContent: "center",
    },
    ctaBtn: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.75rem",
      padding: "1rem 2rem",
      borderRadius: "1.25rem",
      textDecoration: "none",
      border: "none",
      cursor: "pointer",
    },
    cardOuter: {
      position: "absolute",
      inset: 0,
      zIndex: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      perspective: "1500px",
    },
    mainCard: {
      position: "relative",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "auto",
      width: "92vw",
      height: "92vh",
      borderRadius: "32px",
    },
    cardGrid: {
      position: "relative",
      width: "100%",
      height: "100%",
      maxWidth: "80rem",
      margin: "0 auto",
      padding: "1.5rem 1rem",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-evenly",
      alignItems: "center",
      zIndex: 10,
    },
    brandName: {
      fontSize: "clamp(2rem, 4.5vw, 3rem)",
      fontWeight: 900,
      textTransform: "uppercase",
      letterSpacing: "-0.05em",
    },
    mockupWrapper: {
      position: "relative",
      width: "100%",
      height: "380px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
      perspective: "1000px",
    },
    mockupInner: {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transform: "scale(0.65)",
    },
    phoneBezel: {
      position: "relative",
      width: "280px",
      height: "580px",
      borderRadius: "3rem",
      display: "flex",
      flexDirection: "column",
      willChange: "transform",
    },
    hwBtn: (top, left, h) => ({
      position: "absolute",
      top,
      [left ? "left" : "right"]: "-3px",
      width: "3px",
      height: h,
      borderRadius: left ? "4px 0 0 4px" : "0 4px 4px 0",
      zIndex: 0,
    }),
    screen: {
      position: "absolute",
      inset: "7px",
      background: "#050914",
      borderRadius: "2.5rem",
      overflow: "hidden",
      boxShadow: "inset 0 0 15px rgba(0,0,0,1)",
      color: "#fff",
      zIndex: 10,
    },
    glare: {
      position: "absolute",
      inset: 0,
      zIndex: 40,
      pointerEvents: "none",
    },
    dynamicIsland: {
      position: "absolute",
      top: "5px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "100px",
      height: "28px",
      background: "#000",
      borderRadius: "9999px",
      zIndex: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "0 0.75rem",
      boxShadow: "inset 0 -1px 2px rgba(255,255,255,0.1)",
    },
    pulseDot: {
      width: "6px",
      height: "6px",
      borderRadius: "9999px",
      background: "#22c55e",
      boxShadow: "0 0 8px rgba(34,197,94,0.8)",
      animation: "pulse 2s infinite",
    },
    appInterface: {
      position: "relative",
      width: "100%",
      height: "100%",
      paddingTop: "3rem",
      paddingLeft: "1.25rem",
      paddingRight: "1.25rem",
      paddingBottom: "2rem",
      display: "flex",
      flexDirection: "column",
    },
    widgetRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "2rem",
    },
    progressWrapper: {
      position: "relative",
      width: "176px",
      height: "176px",
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "2rem",
      filter: "drop-shadow(0 15px 25px rgba(0,0,0,0.8))",
    },
    counterVal: {
      fontSize: "2.25rem",
      fontWeight: 800,
      letterSpacing: "-0.05em",
      color: "#fff",
    },
    counterLabel: {
      fontSize: "8px",
      color: "rgba(0, 108, 237, 0.5)",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      fontWeight: 700,
      marginTop: "2px",
    },
    widgetCard: {
      borderRadius: "1rem",
      padding: "0.75rem",
      display: "flex",
      alignItems: "center",
    },
    widgetIcon: (from, to, borderColor) => ({
      width: "2.5rem",
      height: "2.5rem",
      borderRadius: "0.75rem",
      background: `linear-gradient(to bottom right, ${from}, ${to})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginRight: "0.75rem",
      border: `1px solid ${borderColor}`,
      boxShadow: "inset 0 0 8px rgba(0,0,0,0.3)",
    }),
    placeholderBar: (w) => ({
      height: "8px",
      width: w,
      borderRadius: "9999px",
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
      marginBottom: "0.5rem",
    }),
    homeBar: {
      position: "absolute",
      bottom: "8px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "120px",
      height: "4px",
      background: "rgba(255,255,255,0.2)",
      borderRadius: "9999px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.5)",
    },
    badge: (position) => ({
      position: "absolute",
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      borderRadius: "1rem",
      padding: "0.75rem 1rem",
      zIndex: 30,
      ...position,
    }),
    badgeIcon: (from, to, borderColor) => ({
      width: "2.5rem",
      height: "2.5rem",
      borderRadius: "9999px",
      background: `linear-gradient(to bottom, ${from}, ${to})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: `1px solid ${borderColor}`,
      boxShadow: "inset 0 0 4px rgba(0,0,0,0.3)",
    }),
    leftText: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      textAlign: "center",
      zIndex: 20,
      width: "100%",
      padding: "0 1rem",
    },
    leftHeading: {
      color: "#fff",
      fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
      fontWeight: 700,
      marginBottom: 0,
      letterSpacing: "-0.02em",
    },
    leftDesc: {
      color: "rgba(168, 185, 247, 0.7)",
      fontSize: "clamp(0.85rem, 1.2vw, 1.1rem)",
      fontWeight: 400,
      lineHeight: 1.7,
      maxWidth: "24rem",
      margin: "0 auto",
    },
  };

  return (
    <div ref={containerRef} style={s.container}>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="film-grain" aria-hidden="true" />
      <div className="bg-grid-theme" style={s.gridOverlay} aria-hidden="true" />

      {/* Hero Text */}
      <div className="hero-text-wrapper" style={s.heroTextWrapper}>
        <h1 className="text-track gsap-reveal text-3d-matte" style={s.tagline1}>
          {tagline1}
        </h1>
        <h1 className="text-days gsap-reveal text-silver-matte" style={s.tagline2}>
          {tagline2}
        </h1>
      </div>

      {/* CTA Section */}
      <div className="cta-wrapper gsap-reveal" style={s.ctaWrapper}>
        <h2 className="text-silver-matte" style={s.ctaHeading}>{ctaHeading}</h2>
        <p style={s.ctaDesc}>{ctaDescription}</p>
        <div style={s.ctaBtns}>
          {onGoogleLogin && (
            <button onClick={onGoogleLogin} className="btn-modern-light" style={s.ctaBtn}>
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", color: "#6b7280", textTransform: "uppercase", marginBottom: "-2px" }}>Continue with</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>Google</div>
              </div>
            </button>
          )}
          {onAppleLogin && (
            <button onClick={onAppleLogin} className="btn-modern-dark" style={s.ctaBtn}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", color: "#9ca3af", textTransform: "uppercase", marginBottom: "-2px" }}>Continue with</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>Apple</div>
              </div>
            </button>
          )}
          {onSignupClick && (
            <button onClick={onSignupClick} className="btn-modern-dark" style={s.ctaBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", color: "#9ca3af", textTransform: "uppercase", marginBottom: "-2px" }}>Sign up with</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>Email</div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Deep Card Layer */}
      <div style={s.cardOuter}>
        <div ref={mainCardRef} className="main-card premium-depth-card gsap-reveal" style={s.mainCard}>
          <div className="card-sheen" aria-hidden="true" />

          <div style={s.cardGrid}>
            {/* Brand Name */}
            <div className="card-right-text gsap-reveal" style={{ display: "flex", justifyContent: "center", width: "100%", order: 1 }}>
              <h2 className="text-card-silver-matte" style={s.brandName}>{brandName}</h2>
            </div>

            {/* YouTube Video */}
            <div className="mockup-scroll-wrapper" style={{ ...s.mockupWrapper, order: 2, height: "auto", maxWidth: "800px" }}>
              <div ref={mockupRef} style={{ position: "relative", width: "100%", willChange: "transform" }}>
                <div style={{
                  position: "relative",
                  width: "100%",
                  paddingBottom: "56.25%",
                  borderRadius: "1.25rem",
                  overflow: "hidden",
                  boxShadow: "0 40px 80px -15px rgba(0,0,0,0.9), 0 15px 25px -5px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(0, 108, 237, 0.1)",
                }}>
                  <iframe
                    src="https://www.youtube.com/embed/NPpNoje545k"
                    title="Wallie AI Demo"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                  />
                </div>

                {/* Floating Badges */}
                <div className="floating-badge floating-ui-badge" style={s.badge({ top: "-20px", left: "-30px" })}>
                  <div style={s.badgeIcon("rgba(0, 108, 237, 0.2)", "rgba(0, 108, 237, 0.1)", "rgba(0, 108, 237, 0.3)")}>
                    <span style={{ fontSize: "1.1rem" }} aria-hidden="true">📈</span>
                  </div>
                  <div>
                    <p style={{ color: "#fff", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Bullish Signal</p>
                    <p style={{ color: "rgba(0, 108, 237, 0.5)", fontSize: "10px", fontWeight: 500, margin: 0 }}>BTC/USD detected</p>
                  </div>
                </div>

                <div className="floating-badge floating-ui-badge" style={s.badge({ bottom: "-20px", right: "-30px" })}>
                  <div style={s.badgeIcon("rgba(75, 147, 255, 0.2)", "rgba(75, 147, 255, 0.1)", "rgba(75, 147, 255, 0.3)")}>
                    <span style={{ fontSize: "1rem" }} aria-hidden="true">🤖</span>
                  </div>
                  <div>
                    <p style={{ color: "#fff", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>AI Analysis</p>
                    <p style={{ color: "rgba(0, 108, 237, 0.5)", fontSize: "10px", fontWeight: 500, margin: 0 }}>Chart processed</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Description Text */}
            <div className="card-left-text gsap-reveal" style={{ ...s.leftText, order: 3 }}>
              <h3 style={s.leftHeading}>{cardHeading}</h3>
              <p className="card-left-desc-desktop" style={s.leftDesc}>{cardDescription}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
