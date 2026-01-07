"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useRef } from "react";

// Icons as inline SVGs for maximum performance
const MicIcon = () => (
  <svg
    className="size-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <path d="M12 19v3m-4 0h8" />
  </svg>
);

const MapIcon = () => (
  <svg
    className="size-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7Z" />
    <path d="M9 4v13m6-10v13" />
  </svg>
);

const RocketIcon = () => (
  <svg
    className="size-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

const CalendarIcon = () => (
  <svg
    className="size-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </svg>
);

const UsersIcon = () => (
  <svg
    className="size-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const BrainIcon = () => (
  <svg
    className="size-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    <path d="M12 5v13" />
    <path d="M15 13h-6" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg
    className="size-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M5 12h14m-7-7 7 7-7 7" />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="size-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const SparkleIcon = () => (
  <svg
    className="size-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z" />
  </svg>
);

// Animated background grid
function AnimatedGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />

      {/* Animated grid lines */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.03] dark:opacity-[0.05]">
        <defs>
          <pattern
            id="grid"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 60 0 L 0 0 0 60"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Floating orbs */}
      <div className="animate-float-slow absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="animate-float-slower absolute -right-32 bottom-1/4 h-80 w-80 rounded-full bg-chart-2/10 blur-3xl" />
      <div className="animate-float absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-4/10 blur-3xl" />
    </div>
  );
}

// Animated typing effect for hero
function TypewriterText({ texts }: { texts: string[] }) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentFullText = texts[currentTextIndex];
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (displayText.length < currentFullText.length) {
            setDisplayText(currentFullText.slice(0, displayText.length + 1));
          } else {
            setTimeout(() => setIsDeleting(true), 2000);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText(displayText.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentTextIndex((prev) => (prev + 1) % texts.length);
          }
        }
      },
      isDeleting ? 30 : 80
    );

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentTextIndex, texts]);

  return (
    <span className="text-primary">
      {displayText}
      <span className="animate-blink ml-0.5 inline-block h-[1.1em] w-[3px] translate-y-[0.1em] bg-primary" />
    </span>
  );
}

// Animated counter for stats
function AnimatedCounter({
  end,
  suffix = "",
  prefix = "",
}: {
  end: number;
  suffix?: string;
  prefix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 2000;
          const steps = 60;
          const increment = end / steps;
          let current = 0;

          const timer = setInterval(() => {
            current += increment;
            if (current >= end) {
              setCount(end);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, hasAnimated]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// Feature card with hover effects
function FeatureCard({
  icon,
  title,
  description,
  gradient,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  delay: string;
}) {
  return (
    <div
      className="animate-fade-up group relative"
      style={{ animationDelay: delay }}
    >
      <div
        className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-br ${gradient} opacity-0 blur transition-all duration-500 group-hover:opacity-100 group-hover:blur-md`}
      />
      <Card className="relative h-full overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-xl">
        {/* Corner accent */}
        <div
          className={`absolute -right-12 -top-12 h-24 w-24 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-2xl transition-all duration-500 group-hover:opacity-40`}
        />

        <CardHeader className="relative">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary ring-1 ring-primary/20 transition-all duration-300 group-hover:scale-110 group-hover:ring-primary/40">
            {icon}
          </div>
          <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-base leading-relaxed">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}

// Process step component
function ProcessStep({
  number,
  title,
  description,
  isLast,
}: {
  number: number;
  title: string;
  description: string;
  isLast?: boolean;
}) {
  return (
    <div className="group relative flex gap-6">
      {/* Timeline */}
      <div className="flex flex-col items-center">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 font-mono text-lg font-bold text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-primary/10 transition-all duration-300 group-hover:scale-110 group-hover:ring-primary/30">
          {number}
          <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-20" />
        </div>
        {!isLast && (
          <div className="mt-4 h-full w-px bg-gradient-to-b from-primary/50 to-transparent" />
        )}
      </div>

      {/* Content */}
      <div className="pb-12">
        <h4 className="mb-2 text-lg font-semibold tracking-tight">{title}</h4>
        <p className="leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const features = [
    {
      icon: <MicIcon />,
      title: "Reality-Check Voice Interview",
      description:
        "Our AI-powered Hume EVI 3 interviewer conducts emotionally intelligent assessments, establishing a high-stakes capability benchmark that reveals your true potential beyond the resume.",
      gradient: "from-primary/60 to-chart-1/60",
    },
    {
      icon: <MapIcon />,
      title: "Dynamic Roadmaps",
      description:
        "Personalized learning paths calibrated by real-time market data from Jooble and Adzuna. Your roadmap evolves as the job market shifts, keeping you ahead of the curve.",
      gradient: "from-chart-2/60 to-chart-4/60",
    },
    {
      icon: <RocketIcon />,
      title: "Autonomous Job Hunting",
      description:
        "Our Action Agent handles the tedious work—finding opportunities, crafting applications via RAG and Vector DB, and managing email threads. You focus on growing, we handle the grind.",
      gradient: "from-chart-1/60 to-primary/60",
    },
    {
      icon: <CalendarIcon />,
      title: "Weekly Sprint Interviews",
      description:
        "Regular logic verification sessions that track your progress and prove your growth. Build a verifiable history of skill development that recruiters can trust.",
      gradient: "from-chart-4/60 to-chart-2/60",
    },
    {
      icon: <UsersIcon />,
      title: "Digital Twins",
      description:
        "Your verified growth metrics create a digital representation of your capabilities. Recruiters see real 'Proof of Resilience' instead of static credentials.",
      gradient: "from-primary/60 to-chart-2/60",
    },
    {
      icon: <BrainIcon />,
      title: "Strategist Intelligence",
      description:
        "Automated rejection parsing triggers real-time roadmap re-pathing. Every 'no' becomes data that makes your next application stronger.",
      gradient: "from-chart-2/60 to-primary/60",
    },
  ];

  const processSteps = [
    {
      title: "Complete Your Reality Check",
      description:
        "Start with our AI voice interview that benchmarks your current capabilities across technical skills, problem-solving, and emotional intelligence.",
    },
    {
      title: "Receive Your Dynamic Roadmap",
      description:
        "Get a personalized, market-calibrated learning path that adapts in real-time based on trending job requirements and your progress.",
    },
    {
      title: "Activate Autonomous Hunting",
      description:
        "Deploy our Action Agent to automatically find, apply, and follow up on opportunities that match your profile and aspirations.",
    },
    {
      title: "Prove Your Growth Weekly",
      description:
        "Complete sprint interviews that verify your learning and build a trusted record of skill development for recruiters to see.",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans">
      <AnimatedGrid />

      {/* Navigation */}
      <nav className="relative z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
              <SparkleIcon />
            </div>
            <span className="font-mono text-lg font-bold tracking-tight">
              Career<span className="text-primary">Prep</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link
              href="#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              How It Works
            </Link>
            <Link
              href="#stats"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Results
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 py-24 md:py-32 lg:py-40">
        <div className="container">
          <div className="mx-auto max-w-4xl text-center">
            <Badge
              variant="outline"
              className="animate-fade-up mb-6 gap-2 border-primary/30 bg-primary/5 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-primary"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Multi-Agent Orchestration System
            </Badge>

            <h1
              className="animate-fade-up mb-8 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl lg:text-6xl xl:text-7xl"
              style={{ animationDelay: "100ms" }}
            >
              Bridge the gap from{" "}
              <span className="relative">
                <span className="relative z-10">student</span>
                <span className="absolute -inset-1 -skew-y-1 bg-primary/10" />
              </span>{" "}
              to{" "}
              <TypewriterText
                texts={["professional", "hired", "confident", "unstoppable"]}
              />
            </h1>

            <p
              className="animate-fade-up mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl"
              style={{ animationDelay: "200ms" }}
            >
              The autonomous career system that combines emotional intelligence,
              real-time market sensing, and AI-powered execution to match you
              with opportunities based on true potential—not static resumes.
            </p>

            <div
              className="animate-fade-up flex flex-col items-center justify-center gap-4 sm:flex-row"
              style={{ animationDelay: "300ms" }}
            >
              <Button size="lg" className="group gap-2 px-8" asChild>
                <Link href="/sign-up">
                  Start Your Reality Check
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 px-8"
                asChild
              >
                <Link href="#how-it-works">See How It Works</Link>
              </Button>
            </div>

            {/* Trust indicators */}
            <div
              className="animate-fade-up mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
              style={{ animationDelay: "400ms" }}
            >
              <div className="flex items-center gap-2">
                <CheckIcon />
                <span>AI-Powered Voice Interviews</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon />
                <span>Real-Time Market Data</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon />
                <span>Autonomous Applications</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-24 md:py-32">
        <div className="container">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-chart-2/30 bg-chart-2/5 text-chart-2"
            >
              Powered by 5 Autonomous Agents
            </Badge>
            <h2 className="mb-4">Your Personal Career Command Center</h2>
            <p className="text-lg text-muted-foreground">
              A multi-agent orchestration system that works 24/7 to accelerate
              your transition from academic learning to professional success.
            </p>
          </div>

          <div
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            style={{ "--min-col-width": "320px" } as React.CSSProperties}
          >
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                {...feature}
                delay={`${index * 100}ms`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative z-10 py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />
        <div className="container relative">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-chart-1/30 bg-chart-1/5 text-chart-1"
            >
              Simple 4-Step Process
            </Badge>
            <h2 className="mb-4">From Zero to Hired</h2>
            <p className="text-lg text-muted-foreground">
              Our autonomous system handles the complexity while you focus on
              growth. Here&apos;s how the journey unfolds.
            </p>
          </div>

          <div className="mx-auto max-w-2xl">
            {processSteps.map((step, index) => (
              <ProcessStep
                key={step.title}
                number={index + 1}
                {...step}
                isLast={index === processSteps.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="relative z-10 py-24 md:py-32">
        <div className="container">
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/50 p-8 backdrop-blur-sm md:p-12 lg:p-16">
            <div className="mb-12 text-center">
              <h2 className="mb-4">Built for Results</h2>
              <p className="mx-auto max-w-xl text-muted-foreground">
                Our multi-agent system delivers measurable outcomes for students
                transitioning to professional careers.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div className="text-center">
                <div className="mb-2 font-mono text-4xl font-bold text-primary md:text-5xl">
                  <AnimatedCounter end={85} suffix="%" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Interview Confidence Threshold
                </p>
              </div>
              <div className="text-center">
                <div className="mb-2 font-mono text-4xl font-bold text-chart-2 md:text-5xl">
                  <AnimatedCounter end={24} suffix="/7" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Autonomous Job Hunting
                </p>
              </div>
              <div className="text-center">
                <div className="mb-2 font-mono text-4xl font-bold text-chart-1 md:text-5xl">
                  <AnimatedCounter end={5} prefix="" suffix="x" />
                </div>
                <p className="text-sm text-muted-foreground">
                  More Applications Sent
                </p>
              </div>
              <div className="text-center">
                <div className="mb-2 font-mono text-4xl font-bold text-chart-4 md:text-5xl">
                  <AnimatedCounter end={12} suffix=" States" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Agent Memory Persistence
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-24 md:py-32">
        <div className="container">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-chart-1" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(0,0,0,0.15),transparent_50%)]" />

            {/* Grid overlay */}
            <svg className="absolute inset-0 h-full w-full opacity-10">
              <defs>
                <pattern
                  id="cta-grid"
                  width="40"
                  height="40"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="white"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cta-grid)" />
            </svg>

            <div className="relative px-8 py-16 text-center text-white md:px-16 md:py-20">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
                Ready to prove your true potential?
              </h2>
              <p className="mx-auto mb-8 max-w-xl text-lg text-white/80">
                Join the autonomous career revolution. Let our multi-agent
                system handle the grind while you focus on becoming
                unstoppable.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  size="lg"
                  variant="secondary"
                  className="gap-2 bg-white px-8 text-primary shadow-xl hover:bg-white/90"
                  asChild
                >
                  <Link href="/sign-up">
                    Start Your Journey
                    <ArrowRightIcon />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="gap-2 px-8 text-white hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <Link href="/sign-in">Already have an account?</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 bg-card/30 py-12 backdrop-blur-sm">
        <div className="container">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80">
                <SparkleIcon />
              </div>
              <span className="font-mono text-lg font-bold tracking-tight">
                Career<span className="text-primary">Prep</span>
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Multi-agent orchestration for the next generation of
              professionals.
            </p>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="#" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link href="#" className="transition-colors hover:text-foreground">
                Terms
              </Link>
              <Link href="#" className="transition-colors hover:text-foreground">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
