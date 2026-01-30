"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  CreditCard,
  Users,
  Ticket,
  Search,
  Mic,
  UserPlus,
  BarChart3,
  ArrowRight,
  Menu,
  X,
  ShieldAlert
} from "lucide-react";

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    {
      icon: <CalendarDays className="w-8 h-8 text-blue-400" />,
      title: "Timetable-Based AI Agent Booking (with Academic Calendar)",
      desc: "Upload your college timetable and academic calendar, and our AI agent automatically books your auto every day before classes—no manual booking required. Rides are intelligently skipped on holidays and non-working days for a seamless experience."
    },
    {
      icon: <CreditCard className="w-8 h-8 text-yellow-400" />,
      title: "Subscription & Credits",
      desc: "Choose flexible subscription plans or prepaid credits for seamless rides at a much lower cost than paying daily. Subscriptions help students save money on regular travel while eliminating the hassle of daily cash payments."
    },
    {
      icon: <Users className="w-8 h-8 text-green-400" />,
      title: "Ride Sharing",
      desc: "Share rides with fellow students heading in the same direction. Save money, reduce waiting time, and travel smarter with convenient, coordinated rides."
    },
    {
      icon: <Ticket className="w-8 h-8 text-purple-400" />,
      title: "Token System & Emergency Ride",
      desc: "Every student receives a token number when requesting a ride, forming a fair, queue-based system for bookings. The app shows the current serving token in real time, so students know exactly when their turn is coming. Emergency rides are also available to ensure you’re never stranded when you need to reach somewhere urgently or if you’re running late."
    },
    {
      icon: <Search className="w-8 h-8 text-orange-400" />,
      title: "Lost & Found",
      desc: "Report or claim lost items effortlessly through the app. Students and drivers can securely coordinate to recover belongings quickly and safely."
    },
    {
      icon: <Mic className="w-8 h-8 text-red-400" />,
      title: "MIC Booking",
      desc: "Book rides instantly using voice commands. Perfect for hands-free, on-the-go access, ensuring you never miss a ride when you’re in a hurry."
    },
    {
      icon: <UserPlus className="w-8 h-8 text-pink-400" />,
      title: "Ride with Friends",
      desc: "Invite your friends to join your ride and travel together in the same auto—even if your homes are in different locations. The app plans the route so everyone can be picked up directly from their doorstep. Safe, fun, and convenient—group travel has never been easier."
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-indigo-400" />,
      title: "Driver Earnings Analysis",
      desc: "Drivers get clear insights into their daily and weekly earnings. Track performance, plan ahead, and optimize your rides for better income."
    },
    {
      icon: <ShieldAlert className="w-8 h-8 text-red-500" />,
      title: "SOS Safety Feature",
      desc: "Student safety comes first. With the SOS feature, students can instantly send an emergency alert during a ride. The alert notifies pre-saved emergency contacts (such as parents or guardians) and shares live ride details, driver information, and real-time location. Quick access ensures help is just one tap away when it matters most."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-blue-500/30">

      {/* 1. TOP NAVIGATION BAR (Taskbar-like) */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-white/5 
        ${isScrolled ? "bg-gray-900/80 backdrop-blur-md shadow-2xl py-3" : "bg-transparent py-5"}`}
      >
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🛺</span>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              CampusRide
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Features</a>
            <Link href="/about" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">About</Link>
            <Link href="/contact" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Contact</Link>
            <Link
              href="/login"
              className="px-6 py-2 bg-white text-gray-900 font-bold rounded-full hover:bg-gray-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white">
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-gray-900 border-b border-gray-800 p-6 flex flex-col gap-4 shadow-xl">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-gray-300">Features</a>
            <Link href="/about" className="text-gray-300">About</Link>
            <Link href="/contact" className="text-gray-300">Contact</Link>
            <Link href="/login" className="bg-blue-600 text-center py-3 rounded-xl font-bold">Get Started</Link>
          </div>
        )}
      </nav>

      {/* 2. HERO SECTION */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] -z-10" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px] -z-10" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 animate-fade-in-up">
            <div className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold tracking-wider text-blue-300 mb-2">
              🚀 THE FUTURE OF CAMPUS COMMUTE
            </div>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              Smart Rides for <br />
              <span className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
                University Life
              </span>
            </h1>
            <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
              Experience the smartest way to travel to campus. AI-powered schedules, shared rides, and seamless payments—all in currently "CampusRide".
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/login"
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all active:scale-95"
              >
                Book a Ride <ArrowRight className="w-5 h-5" />
              </Link>
              {/* Plan button removed */}
            </div>

            <div className="flex items-center gap-6 pt-4 text-sm text-gray-500 font-medium">
              <span className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live Token System</span>
              <span className="flex items-center gap-2"><div className="w-2 h-2 bg-yellow-500 rounded-full" /> 24/7 Support</span>
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative animate-float cursor-pointer group">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 to-purple-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all" />
            <div className="relative bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl hover:scale-[1.02] transition-transform duration-500">
              {/* Use the generated image if available, else a nice gradient placeholder or default */}
              <img
                src="https://images.unsplash.com/photo-1620619767323-b95a89183081?q=80&w=2070&auto=format&fit=crop"
                alt="CampusRide Concept"
                className="w-full h-auto object-cover opacity-80 mix-blend-overlay hover:opacity-100 transition-opacity" // Fallback aesthetic
                style={{ display: 'none' }} // Hiding Unsplash to use the Generated one below if we put it in public
              />
              <div className="aspect-[4/3] bg-gradient-to-br from-gray-800 to-black flex items-center justify-center relative overflow-hidden">
                {/* We can use the generated image path relative to artifacts if we copied it to public, but for now let's use a placeholder component or the Unsplash above if we didn't copy. 
                      Actually, I will assume I can embed the generated image if I move it.
                      For now, I'll use a strong visual div representing the "App" 
                  */}
                <div className="absolute inset-0 bg-[url('/hero-pattern.svg')] opacity-20"></div>
                <div className="w-[80%] h-[80%] bg-black rounded-2xl border border-gray-700 shadow-2xl relative overflow-hidden flex flex-col">
                  {/* App Mockup Header */}
                  <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  {/* App Mockup Body */}
                  <div className="flex-1 bg-gray-950 p-6 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-3xl shadow-lg">🛺</div>
                    <h3 className="text-2xl font-bold text-white">CampusRide</h3>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="w-2/3 h-full bg-blue-500 animate-slide"></div>
                    </div>
                    <p className="text-xs text-blue-400 font-mono">Searching for nearby drivers...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FEATURES GRID */}
      <section id="features" className="py-24 bg-gray-900/50 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold">Everything You Need</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              From AI-scheduled rides to emergency SOS, we've packed CampusRide with features designed for student life.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="bg-gray-950 p-6 rounded-3xl border border-gray-800 hover:border-blue-500/50 hover:bg-gray-900 transition-all group hover:-translate-y-2 duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg group-hover:shadow-blue-500/10">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-blue-400 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-600 text-sm border-t border-gray-900">
        <p>© 2026 CampusRide. Driven by Innovation.</p>
      </footer>
    </div>
  );
}
