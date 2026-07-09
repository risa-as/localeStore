"use client";

import { useEffect, useRef, useState } from "react";
import { El_Messiri, Tajawal } from "next/font/google";
import { Product } from "@/types";
import { QuickOrderForm } from "../quick-order-form";
import { ShieldCheck, Truck, RotateCcw } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { sendCAPIEvent } from "@/lib/actions/facebook.actions";
import FbPixel from "../../facebook-pixel";
import "./syt-fath-mfasl.css";

const elMessiri = El_Messiri({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-messiri",
});
const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["200", "300", "400", "500", "700"],
  variable: "--font-tajawal",
});

const ASSET = "/lp/syt-fath-mfasl";
// Real counts from the extracted sequences (see scripts in tmp/lp-assets).
const FRAMES_LANDSCAPE = 93;
const FRAMES_PORTRAIT = 93;
const GROUND = "#07090c";

export default function CinematicSytFathMfasl({
  product,
}: {
  product: Product;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [eventId] = useState(() => uuidv4());

  useEffect(() => {
    sendCAPIEvent("PageView", eventId, {
      eventSourceUrl: window.location.href,
    }).catch(console.error);
  }, [eventId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }, { default: Lenis }] =
        await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
          import("lenis"),
        ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const clamp = (v: number, a: number, b: number) =>
        Math.max(a, Math.min(b, v));
      const smooth = (e0: number, e1: number, x: number) => {
        const t = clamp((x - e0) / (e1 - e0), 0, 1);
        return t * t * (3 - 2 * t);
      };
      const q = <T extends Element = HTMLElement>(sel: string) =>
        root.querySelector(sel) as T | null;
      const portrait = window.matchMedia("(orientation: portrait)").matches;

      const disposers: Array<() => void> = [];

      // ---- graceful asset fallback
      root.querySelectorAll("img[src]").forEach((img) => {
        const onErr = () => {
          (img as HTMLElement).style.display = "none";
          const h = img.closest(".fallback-host");
          if (h) h.classList.add("is-missing");
        };
        img.addEventListener("error", onErr, { once: true });
        disposers.push(() => img.removeEventListener("error", onErr));
      });

      // ---- Lenis driven by GSAP ticker (one rAF clock)
      let lenis: InstanceType<typeof Lenis> | null = null;
      if (!reduce) {
        lenis = new Lenis({
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
        });
        lenis.on("scroll", ScrollTrigger.update);
        const tick = (t: number) => lenis && lenis.raf(t * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        (window as unknown as { lenis: unknown }).lenis = lenis;
        disposers.push(() => gsap.ticker.remove(tick));
      }
      const scrollToOrder = (e: Event) => {
        e.preventDefault();
        const t = q("#clp-order");
        if (!t) return;
        if (lenis) lenis.scrollTo(t, { offset: -10 });
        else t.scrollIntoView({ behavior: "smooth" });
      };
      root.querySelectorAll("[data-goto-order]").forEach((a) => {
        a.addEventListener("click", scrollToOrder);
        disposers.push(() => a.removeEventListener("click", scrollToOrder));
      });

      const ctx = gsap.context(() => {
        // ---- header hide/show + progress
        const header = q(".clp-header");
        const progress = q(".clp-progress");
        ScrollTrigger.create({
          start: 0,
          end: "max",
          onUpdate: (s) => {
            if (progress) progress.style.transform = `scaleX(${s.progress})`;
            if (!header) return;
            header.classList.toggle("solid", s.scroll() > 40);
            if (s.scroll() > 140)
              header.classList.toggle("hidden", s.direction === 1);
            else header.classList.remove("hidden");
          },
        });

        // ---- ambient per section
        const ambient = q(".clp-ambient");
        const glow = q(".clp-glow");
        const applyAmbient = (c: string, g: number) => {
          if (!ambient || !glow) return;
          gsap.to(ambient, {
            backgroundColor: c,
            duration: 1.1,
            overwrite: "auto",
            ease: "power2.out",
          });
          gsap.to(glow, { opacity: g, duration: 1.1, overwrite: "auto" });
        };
        root
          .querySelectorAll<HTMLElement>("section[data-ambient]")
          .forEach((sec) => {
            const c = sec.dataset.ambient as string;
            const g = parseFloat(sec.dataset.glow || "0.5");
            ScrollTrigger.create({
              trigger: sec,
              start: "top 60%",
              end: "bottom 40%",
              onEnter: () => applyAmbient(c, g),
              onEnterBack: () => applyAmbient(c, g),
            });
          });

        // ---- reveals
        root.querySelectorAll<HTMLElement>(".reveal").forEach((el) => {
          if (reduce) {
            el.classList.add("in");
            return;
          }
          ScrollTrigger.create({
            trigger: el,
            start: "top 86%",
            once: true,
            onEnter: () => el.classList.add("in"),
          });
        });

        // ---- hero entrance + parallax + handoff
        if (!reduce) {
          gsap
            .timeline({ defaults: { ease: "power3.out" } })
            .fromTo(
              ".clp-hero .hero-media",
              { opacity: 0, scale: 0.82, y: 60, rotateZ: -5 },
              { opacity: 1, scale: 1, y: 0, rotateZ: 0, duration: 1.5 },
              0.15,
            )
            .fromTo(
              ".clp-hero .latin",
              { opacity: 0, y: 14 },
              { opacity: 1, y: 0, duration: 0.8 },
              0.55,
            )
            .fromTo(
              ".clp-hero h1",
              { opacity: 0, y: 24, clipPath: "inset(0 0 100% 0)" },
              { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)", duration: 1.1 },
              0.7,
            )
            .fromTo(
              ".clp-hero .sub",
              { opacity: 0, y: 12 },
              { opacity: 1, y: 0, duration: 0.8 },
              1.05,
            )
            .fromTo(
              ".clp-hero .scrollcue",
              { opacity: 0 },
              { opacity: 1, duration: 0.8 },
              1.3,
            );
          gsap.to(".clp-hero .hero-inner", {
            scrollTrigger: {
              trigger: ".clp-hero",
              start: "top top",
              end: "78% top",
              scrub: true,
            },
            y: -50,
            opacity: 0,
            ease: "none",
          });
          gsap.to(".clp-hero .aura", {
            scrollTrigger: {
              trigger: ".clp-hero",
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
            scale: 1.5,
            opacity: 0,
            ease: "none",
          });
          gsap.to(".clp-ritual .frame img", {
            scrollTrigger: {
              trigger: ".clp-ritual",
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
            y: "-7%",
            ease: "none",
          });

          const stage = q(".clp-hero .stage");
          const tilt = q(".clp-hero .media-tilt");
          const aura = q(".clp-hero .aura");
          const motes = q(".clp-hero .motes");
          if (stage && tilt && aura && motes) {
            const onMove = (e: PointerEvent) => {
              const r = stage.getBoundingClientRect();
              const nx = (e.clientX - r.left) / r.width - 0.5;
              const ny = (e.clientY - r.top) / r.height - 0.5;
              tilt.style.setProperty("--ty", (nx * 12).toFixed(2) + "deg");
              tilt.style.setProperty("--tx", (-ny * 9).toFixed(2) + "deg");
              aura.style.setProperty("--px", (-nx * 46).toFixed(1) + "px");
              aura.style.setProperty("--py", (-ny * 34).toFixed(1) + "px");
              motes.style.transform = `translate3d(${(nx * 22).toFixed(1)}px,${(ny * 16).toFixed(1)}px,0)`;
            };
            const onLeave = () => {
              tilt.style.setProperty("--ty", "0deg");
              tilt.style.setProperty("--tx", "0deg");
              aura.style.setProperty("--px", "0px");
              aura.style.setProperty("--py", "0px");
              motes.style.transform = "translate3d(0,0,0)";
            };
            stage.addEventListener("pointermove", onMove);
            stage.addEventListener("pointerleave", onLeave);
            disposers.push(() => {
              stage.removeEventListener("pointermove", onMove);
              stage.removeEventListener("pointerleave", onLeave);
            });
          }
        } else {
          root
            .querySelectorAll<HTMLElement>(
              ".clp-hero .latin,.clp-hero .hero-media,.clp-hero h1,.clp-hero .sub,.clp-hero .scrollcue",
            )
            .forEach((e) => {
              e.style.opacity = "1";
              e.style.clipPath = "none";
            });
        }

        // ---- FILM: canvas frame sequence (never video.currentTime)
        (function initFilm() {
          const canvas = q<HTMLCanvasElement>("#clpFilmCanvas");
          const stage = canvas?.closest(".stage") as HTMLElement | null;
          const fallback = q<HTMLImageElement>(".clp-film .film-fallback");
          const loaderEl = q(".clp-film .loader");
          const caps = Array.from(
            root.querySelectorAll<HTMLElement>(".clp-film .cap"),
          );
          if (!canvas || !stage) return;
          const ctx2d = canvas.getContext("2d", { alpha: false });
          if (!ctx2d) return;

          const FRAME_COUNT = portrait ? FRAMES_PORTRAIT : FRAMES_LANDSCAPE;
          const dir = portrait ? "seqv" : "seq";
          const url = (i: number) =>
            `${ASSET}/${dir}/f${String(i).padStart(3, "0")}.webp`;

          const frames: (HTMLImageElement | undefined)[] = new Array(
            FRAME_COUNT,
          );
          let loaded = 0,
            errored = 0,
            ready = false,
            useFallback = false,
            cur = -1,
            lastIdx = 0;
          let filmST: ScrollTrigger | null = null;
          const progIdx = () =>
            filmST
              ? Math.round(clamp(filmST.progress, 0, 1) * (FRAME_COUNT - 1))
              : 0;

          function showFallback() {
            useFallback = true;
            ready = true;
            canvas!.style.display = "none";
            if (fallback && fallback.complete && fallback.naturalWidth > 0)
              fallback.style.display = "block";
            else if (fallback) fallback.style.display = "none";
            if (loaderEl) (loaderEl as HTMLElement).style.opacity = "0";
          }
          function resize() {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = stage!.clientWidth,
              h = stage!.clientHeight;
            canvas!.width = Math.round(w * dpr);
            canvas!.height = Math.round(h * dpr);
            canvas!.style.width = w + "px";
            canvas!.style.height = h + "px";
            cur = -1;
            if (ready && !useFallback) draw(lastIdx);
          }
          function draw(i: number) {
            if (useFallback) return;
            i = clamp(i, 0, FRAME_COUNT - 1);
            let im = frames[i];
            if (!im) {
              for (let d = 1; d < FRAME_COUNT; d++) {
                if (frames[i - d]) {
                  im = frames[i - d];
                  break;
                }
                if (frames[i + d]) {
                  im = frames[i + d];
                  break;
                }
              }
              if (!im) return;
            }
            if (i === cur) return;
            cur = i;
            lastIdx = i;
            const cw = canvas!.width,
              ch = canvas!.height,
              iw = im.naturalWidth,
              ih = im.naturalHeight,
              s = Math.max(cw / iw, ch / ih),
              dw = iw * s,
              dh = ih * s;
            ctx2d!.fillStyle = GROUND;
            ctx2d!.fillRect(0, 0, cw, ch);
            ctx2d!.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
          }
          function maybeReady() {
            if (ready) return;
            // interleaved order below means ~1/3 loaded already covers the whole
            // film sparsely (draw() falls back to the nearest loaded frame)
            if (
              loaded + errored >= FRAME_COUNT ||
              loaded >= Math.ceil(FRAME_COUNT * 0.34)
            ) {
              if (loaded === 0) {
                showFallback();
                return;
              }
              ready = true;
              if (loaderEl) (loaderEl as HTMLElement).style.opacity = "0";
              resize();
              draw(progIdx());
            }
            if (loaderEl && !ready)
              loaderEl.textContent =
                "… " + Math.round((loaded / FRAME_COUNT) * 100) + "%";
          }

          if (reduce) {
            showFallback();
            return;
          }
          // let the hero image win the bandwidth race: preload starts on the
          // user's first interaction or after ~0.9s, whichever comes first —
          // and in an interleaved order (every 3rd frame first) so the film is
          // scrubbable end-to-end long before all frames arrive
          let preloadStarted = false;
          const startPreload = () => {
            if (preloadStarted) return;
            preloadStarted = true;
            const order: number[] = [];
            for (let s = 0; s < 3; s++)
              for (let i = s; i < FRAME_COUNT; i += 3) order.push(i);
            for (const i of order) {
              const im = new Image();
              im.decoding = "async";
              im.onload = () => {
                frames[i] = im;
                loaded++;
                maybeReady();
              };
              im.onerror = () => {
                errored++;
                maybeReady();
              };
              im.src = url(i);
            }
            const t = setTimeout(() => {
              if (!ready) {
                if (loaded > 0) {
                  ready = true;
                  if (loaderEl) (loaderEl as HTMLElement).style.opacity = "0";
                  resize();
                  draw(progIdx());
                } else showFallback();
              }
            }, 9000);
            disposers.push(() => clearTimeout(t));
          };
          const kickT = setTimeout(startPreload, 900);
          const kickEvs: Array<keyof WindowEventMap> = [
            "wheel",
            "touchstart",
            "pointerdown",
            "keydown",
          ];
          kickEvs.forEach((ev) =>
            window.addEventListener(ev, startPreload, {
              once: true,
              passive: true,
            }),
          );
          disposers.push(() => {
            clearTimeout(kickT);
            kickEvs.forEach((ev) =>
              window.removeEventListener(ev, startPreload),
            );
          });
          window.addEventListener("resize", resize, { passive: true });
          disposers.push(() => window.removeEventListener("resize", resize));

          filmST = ScrollTrigger.create({
            trigger: ".clp-film",
            start: "top top",
            end: "bottom bottom",
            scrub: true,
            onUpdate: (self) => {
              const p = self.progress;
              if (ready && !useFallback)
                draw(Math.round(p * (FRAME_COUNT - 1)));
              for (const c of caps) {
                const a = parseFloat(c.dataset.a || "0"),
                  b = parseFloat(c.dataset.b || "1"),
                  mid = (a + b) / 2,
                  o = Math.min(
                    smooth(a, a + (mid - a) * 0.6, p),
                    1 - smooth(mid + (b - mid) * 0.4, b, p),
                  );
                c.style.opacity = String(Math.max(0, o));
                c.style.transform = `translateY(${12 * (1 - Math.max(0, o))}px)`;
              }
            },
          });
        })();

        // ---- CTA: video alone first, then dim + content reveal
        (function initCTA() {
          const sec = q(".clp-cta");
          const video = q<HTMLVideoElement>("#clpCtaVideo");
          const poster = q<HTMLImageElement>("#clpCtaPoster");
          const dim = q("#clpCtaDim");
          const content = q("#clpCtaContent");
          if (!sec || !video || !poster || !dim || !content) return;
          // portrait phones get the 9:16 loop + a portrait poster frame
          const ctaSrc = portrait ? `${ASSET}/cta-p.mp4` : `${ASSET}/cta.mp4`;
          if (portrait) {
            const pSrc = `${ASSET}/seqv/f092.webp`;
            poster.src = pSrc;
            video.poster = pSrc;
          }
          let started = false;
          const start = () => {
            if (started) return;
            started = true;
            video.src = ctaSrc;
            const pr = video.play();
            if (pr && pr.catch) pr.catch(() => {});
          };
          video.addEventListener("loadeddata", () => {
            poster.style.opacity = "0";
          });
          video.addEventListener("ended", () => {
            video.currentTime = 0;
            const p = video.play();
            if (p && p.catch) p.catch(() => {});
          });
          video.addEventListener("error", () => {
            poster.style.opacity = "1";
          });
          const evs: Array<keyof WindowEventMap> = [
            "pointerdown",
            "keydown",
            "wheel",
            "touchstart",
          ];
          evs.forEach((ev) =>
            window.addEventListener(ev, start, { once: true, passive: true }),
          );
          disposers.push(() =>
            evs.forEach((ev) => window.removeEventListener(ev, start)),
          );
          if (!reduce) {
            ScrollTrigger.create({
              trigger: sec,
              start: "top center",
              onEnter: start,
              onEnterBack: start,
            });
            ScrollTrigger.create({
              trigger: sec,
              start: "top top",
              end: "bottom bottom",
              scrub: true,
              onUpdate: (s) => {
                const p = s.progress;
                (dim as HTMLElement).style.opacity = String(
                  smooth(0.34, 0.66, p),
                );
                (content as HTMLElement).style.opacity = String(
                  smooth(0.4, 0.72, p),
                );
                (content as HTMLElement).style.transform =
                  `translateY(${28 * (1 - smooth(0.4, 0.72, p))}px)`;
              },
            });
          } else {
            (dim as HTMLElement).style.opacity = "0.94";
            (content as HTMLElement).style.opacity = "1";
            (content as HTMLElement).style.transform = "none";
          }
        })();
      }, root);

      const onLoad = () => ScrollTrigger.refresh();
      window.addEventListener("load", onLoad);
      disposers.push(() => window.removeEventListener("load", onLoad));
      if (document.fonts?.ready)
        document.fonts.ready.then(() => !cancelled && ScrollTrigger.refresh());

      cleanup = () => {
        disposers.forEach((d) => d());
        ctx.revert();
        if (lenis) lenis.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      dir="rtl"
      className={`clp ${elMessiri.variable} ${tajawal.variable}`}
    >
      <FbPixel eventName="PageView" eventId={eventId} data={{ url: "/" }} />
      <div className="clp-ambient" />
      <div className="clp-glow" />
      <div className="clp-vignette" />
      <div className="clp-grain" />
      <div className="clp-progress" />

      <header className="clp-header">
        <a className="wm" href="#" onClick={(e) => e.preventDefault()}>
          سيت فاتح مفاصل
        </a>
        <a className="nav-cta" href="#clp-order" data-goto-order>
          اطلب الآن
        </a>
      </header>

      <main>
        {/* 1 · HERO */}
        <section className="clp-hero" data-ambient="#07090c" data-glow="0.55">
          <div className="stage fallback-host">
            <div className="aura" aria-hidden="true" />
            <div className="motes" aria-hidden="true">
              <span
                style={{
                  left: "24%",
                  top: "64%",
                  width: 7,
                  height: 7,
                  animationDuration: "9s",
                  animationDelay: "0s",
                }}
              />
              <span
                style={{
                  left: "38%",
                  top: "72%",
                  width: 5,
                  height: 5,
                  animationDuration: "11s",
                  animationDelay: "1.4s",
                }}
              />
              <span
                style={{
                  left: "52%",
                  top: "60%",
                  width: 9,
                  height: 9,
                  animationDuration: "13s",
                  animationDelay: "3.1s",
                }}
              />
              <span
                style={{
                  left: "63%",
                  top: "70%",
                  width: 4,
                  height: 4,
                  animationDuration: "10s",
                  animationDelay: ".7s",
                }}
              />
              <span
                style={{
                  left: "71%",
                  top: "64%",
                  width: 6,
                  height: 6,
                  animationDuration: "12s",
                  animationDelay: "2.3s",
                }}
              />
              <span
                style={{
                  left: "45%",
                  top: "78%",
                  width: 5,
                  height: 5,
                  animationDuration: "14s",
                  animationDelay: "4.2s",
                }}
              />
              <span
                style={{
                  left: "31%",
                  top: "55%",
                  width: 4,
                  height: 4,
                  animationDuration: "11s",
                  animationDelay: "5.5s",
                }}
              />
              <span
                style={{
                  left: "58%",
                  top: "80%",
                  width: 7,
                  height: 7,
                  animationDuration: "9.5s",
                  animationDelay: "6.1s",
                }}
              />
            </div>
            <div className="hero-inner">
              <span className="latin">Professional Steering Tool Kit</span>
              <div className="media-float">
                <div className="media-tilt">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="hero-media"
                    src={`${ASSET}/product-cut.webp`}
                    alt="سيت فاتح مفاصل"
                    loading="eager"
                    fetchPriority="high"
                  />
                  <span className="specular" aria-hidden="true" />
                </div>
              </div>
              <h1>سيت فاتح مفاصل</h1>
              <div className="sub">
                عدّة المحترف لفك وتركيب أذرع الستيرن — بلا مطرقة، بلا تلف
              </div>
            </div>
            <div className="scrollcue">
              <span>اسحب للأسفل</span>
              <span className="bar" />
            </div>
          </div>
        </section>

        {/* 2 · FILM */}
        <section className="clp-film" data-ambient="#07090c" data-glow="0.7">
          <div className="stage fallback-host">
            <canvas id="clpFilmCanvas" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="film-fallback"
              src={`${ASSET}/product-hero.webp`}
              alt="سيت فاتح مفاصل"
            />
            <div className="caps">
              <div className="cap" data-a="0.02" data-b="0.24">
                من الصندوق… تبدأ الاحترافية
              </div>
              <div className="cap" data-a="0.30" data-b="0.52">
                ثلاث لقم فولاذية… لكل المقاسات
              </div>
              <div className="cap" data-a="0.58" data-b="0.80">
                تُجمَّع في ثوانٍ… وتُمسك بإحكام
              </div>
              <div className="cap" data-a="0.86" data-b="0.99">
                شغل نظيف يليق بورشتك
              </div>
            </div>
            <div className="loader">…</div>
          </div>
        </section>

        {/* 3 · REVEAL */}
        <section className="clp-reveal" data-ambient="#0b0e14" data-glow="0.55">
          <div className="wrap">
            <div className="grid">
              <div className="shot fallback-host reveal">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${ASSET}/product-hero.webp`}
                  alt="سيت فاتح مفاصل — تفاصيل"
                  loading="lazy"
                />
              </div>
              <div className="copy">
                <span className="idx reveal">٠١ — الهندسة</span>
                <h2 className="steel-text reveal">
                  فولاذ ثقيل يتحمّل أقوى شدّ
                </h2>
                <p className="lead reveal">
                  مصنوع من سبائك الفولاذ الثقيل Heavy-Duty ليتحمل الضغط والعمل
                  اليومي الشاق في الورشة — يمسك ذراع الستيرن بقوة ويمنع الانزلاق
                  أثناء الفتح والشد.
                </p>
                <ul className="specs">
                  <li className="reveal">
                    <span className="k">المادة</span>
                    <span className="v">سبائك فولاذ Heavy-Duty</span>
                  </li>
                  <li className="reveal">
                    <span className="k">المقاسات</span>
                    <span className="v">Ø 30–35 / 35–40 / 40–45 mm</span>
                  </li>
                  <li className="reveal">
                    <span className="k">السواقة</span>
                    <span className="v">1/2&Prime; — 32 mm</span>
                  </li>
                  <li className="reveal">
                    <span className="k">الضمان</span>
                    <span className="v">سنتان</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 4 · RITUAL */}
        <section className="clp-ritual" data-ambient="#0e0c09" data-glow="0.5">
          <div className="wrap">
            <div className="frame fallback-host">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${ASSET}/ritual.webp`}
                alt="في الورشة — فك أذرع الستيرن"
                loading="lazy"
              />
              <div className="copy reveal">
                <span className="idx">٠٢ — في الورشة</span>
                <h2 className="steel-text">يغنيك عن فك دودة الستيرن بالكامل</h2>
                <p>
                  وداعاً للطرق العشوائي بالمطرقة وتلف قطع الزبائن — فك وتركيب
                  الأذرع الداخلية وأنت مرتاح، ووفّر ساعات من العمل المتعب بشغل
                  نظيف يعطي انطباعاً ممتازاً عن ورشتك.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5 · OFFERS */}
        <section className="clp-offers" data-ambient="#0b0e14" data-glow="0.5">
          <div className="wrap">
            <div className="head">
              <span className="idx reveal">٠٣ — العروض</span>
              <h2 className="steel-text reveal">اختر عرضك</h2>
            </div>
            <div className="cards">
              <article className="clp-offer-card reveal">
                <div className="pic fallback-host">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${ASSET}/product-hero.webp`}
                    alt="سيت واحد"
                    loading="lazy"
                  />
                </div>
                <div className="body">
                  <h3>سيت واحد</h3>
                  <div className="price">السعر 47 الف</div>
                  <p className="note">التوصيل 5 الاف لكل المحافظات</p>
                </div>
              </article>
              <article className="clp-offer-card reveal">
                <span className="badge">وفر 9 الاف </span>
                <div className="pic fallback-host">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${ASSET}/offer-2set.webp`}
                    alt="سيتان"
                    loading="lazy"
                  />
                </div>
                <div className="body">
                  <h3>سيتان</h3>
                  <div className="price">السعر 85 الف</div>
                  <p className="note">
                    التوصيل 5 الاف لكل المحافظات — اختر الكمية ٢ في الطلب
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* 6 · CTA */}
        <section className="clp-cta" data-ambient="#07090c" data-glow="0.5">
          <div className="stage fallback-host">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="cta-poster"
              id="clpCtaPoster"
              src={`${ASSET}/product-hero.webp`}
              alt=""
              aria-hidden="true"
            />
            <video
              id="clpCtaVideo"
              muted
              playsInline
              preload="none"
              poster={`${ASSET}/product-hero.webp`}
              aria-hidden="true"
            />
            <div className="dim" id="clpCtaDim" />
            <div className="content" id="clpCtaContent">
              <span className="latin">Made for Professionals</span>
              <h2 className="steel-text">ارتقِ بورشتك</h2>
              <p>
                اطلب الآن والدفع عند الاستلام — توصيل مجاني لكل محافظات العراق.
              </p>
              <div className="btns">
                <a
                  className="btn btn-primary"
                  href="#clp-order"
                  data-goto-order
                >
                  اطلب الآن — الدفع عند الاستلام
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 7 · ORDER */}
        <section
          id="clp-order"
          className="clp-order"
          data-ambient="#0b0e14"
          data-glow="0.55"
        >
          <div className="wrap">
            <div className="head">
              <span className="idx reveal">٠٤ — الطلب</span>
              <h2 className="steel-text reveal">أكمل طلبك</h2>
              <p className="sub reveal">
                املأ معلوماتك وسنتواصل معك لتأكيد الطلب — الدفع عند الاستلام
              </p>
            </div>
            <div className="form-shell reveal">
              <div className="form-card" dir="rtl">
                <QuickOrderForm product={product} />
              </div>
            </div>
            <div className="assure reveal">
              <span>
                <ShieldCheck className="w-4 h-4" /> ضمان سنتان
              </span>
              <span>
                <Truck className="w-4 h-4" /> توصيل مجاني
              </span>
              <span>
                <RotateCcw className="w-4 h-4" /> إرجاع سهل
              </span>
            </div>
          </div>
        </section>

        <footer>
          <div className="wrap">
            <div className="wm steel-text">سيت فاتح مفاصل</div>
            <div className="cr">
              © {new Date().getFullYear()} — جميع الحقوق محفوظة
            </div>
          </div>
        </footer>
      </main>

      <a
        href="https://wa.me/9647764046663"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصل معنا على واتساب"
        className="wa-float"
      >
        <svg
          viewBox="0 0 32 32"
          width="30"
          height="30"
          fill="white"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M16.003 2.667C8.639 2.667 2.667 8.639 2.667 16c0 2.364.636 4.674 1.843 6.692L2.667 29.333l6.825-1.787A13.267 13.267 0 0 0 16.003 29.333C23.363 29.333 29.333 23.361 29.333 16c0-7.361-5.97-13.333-13.33-13.333Zm0 24.267a11.01 11.01 0 0 1-5.616-1.539l-.402-.239-4.05 1.061 1.08-3.94-.262-.417A10.946 10.946 0 0 1 5.002 16C5.002 9.925 9.927 5 16.003 5 22.075 5 27 9.925 27 16c0 6.075-4.925 10.934-10.997 10.934Zm6.01-8.196c-.33-.165-1.948-.961-2.25-1.07-.302-.11-.522-.165-.74.165-.22.33-.852 1.07-1.044 1.29-.193.22-.385.247-.715.082-.33-.165-1.393-.513-2.653-1.637-.98-.875-1.642-1.955-1.834-2.285-.193-.33-.02-.508.144-.672.148-.148.33-.385.495-.577.165-.193.22-.33.33-.55.11-.22.055-.413-.027-.578-.083-.165-.74-1.787-1.015-2.447-.267-.642-.538-.554-.74-.565l-.632-.011c-.22 0-.578.083-.88.413-.302.33-1.154 1.128-1.154 2.75 0 1.622 1.18 3.19 1.345 3.41.165.22 2.323 3.547 5.63 4.972.787.34 1.4.543 1.878.695.79.252 1.508.216 2.076.131.633-.094 1.948-.797 2.222-1.566.275-.77.275-1.43.193-1.567-.083-.138-.302-.22-.632-.385Z" />
        </svg>
      </a>
    </div>
  );
}
