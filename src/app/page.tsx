"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  CreditCard,
  Users,
  Ticket,
  Mic,
  UserPlus,
  BarChart3,
  ShieldAlert,
  Search,
  ArrowRight,
  Menu,
  X,
  Mail,
  MapPin,
  Phone,
  Play
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
      icon: <CalendarDays className="w-6 h-6 text-blue-300 icon-spin" />,
      title: "AI Timetable Sync",
      desc: "Upload class schedule. AI books rides automatically."
    },
    {
      icon: <Mic className="w-6 h-6 text-pink-300 icon-spin" />,
      title: "Voice Booking",
      desc: "Just say 'Book a ride'. Hands-free and instant."
    },
    {
      icon: <Users className="w-6 h-6 text-green-300 icon-spin" />,
      title: "Smart Pooling",
      desc: "Split fares with students heading your way."
    },
    {
      icon: <UserPlus className="w-6 h-6 text-purple-300 icon-spin" />,
      title: "Group Travel",
      desc: "Coordinate pickups for your entire squad."
    },
    {
      icon: <Ticket className="w-6 h-6 text-yellow-300 icon-spin" />,
      title: "Live Token Queue",
      desc: "Get digital tokens. No more chaotic waiting."
    },
    {
      icon: <CreditCard className="w-6 h-6 text-indigo-300 icon-spin" />,
      title: "Smart Wallet",
      desc: "Go cashless. One-tap payments & subscriptions."
    },
    {
      icon: <ShieldAlert className="w-6 h-6 text-red-400 icon-spin" />,
      title: "SOS Safety Suite",
      desc: "Share live location instantly with trusted contacts."
    },
    {
      icon: <Search className="w-6 h-6 text-orange-300 icon-spin" />,
      title: "Lost Recovery",
      desc: "Quickly report and recover lost belongings."
    },
    {
      icon: <BarChart3 className="w-6 h-6 text-teal-300 icon-spin" />,
      title: "Driver Analytics",
      desc: "Earnings dashboards and performance insights."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-pink-500/30 overflow-x-hidden">

      {/* 1. ELEGANT NEON NAVBAR */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b border-transparent 
        ${isScrolled ? "bg-gray-950/80 backdrop-blur-xl border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)]" : "bg-transparent py-6"}`}
      >
        <div className="max-w-7xl mx-auto px-6 h-[70px] flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20 group-hover:shadow-purple-500/40 transition-all duration-300 group-hover:scale-110">
              🛺
            </div>
            <span className="text-2xl font-black bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent tracking-tight">
              CampusRide
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {["Features", "About", "Contact"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-sm font-bold text-gray-400 hover:text-white transition-colors hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] shadow-transparent"
              >
                {item}
              </a>
            ))}
            <Link
              href="/login"
              className="btn-neon px-8 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 group"
            >
              Launch App
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav Dropdown */}
        <div className={`md:hidden absolute top-full left-0 w-full bg-gray-950/95 backdrop-blur-xl border-b border-white/10 p-6 flex flex-col gap-6 shadow-2xl transition-all duration-300 ${mobileMenuOpen ? "opacity-100 visible translate-y-0" : "opacity-0 invisible -translate-y-5"}`}>
          {["Features", "About", "Contact"].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMobileMenuOpen(false)} className="text-lg font-bold text-gray-300 hover:text-white">
              {item}
            </a>
          ))}
          <Link href="/login" className="btn-neon w-full py-4 rounded-xl font-bold text-center shadow-lg">
            Launch App
          </Link>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="relative pt-40 pb-32 px-6 overflow-hidden flex items-center justify-center min-h-[90vh]">
        {/* Neon Globs */}
        <div className="absolute top-[10%] left-[10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow mix-blend-screen" />
        <div className="absolute bottom-[10%] right-[10%] w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow delay-1000 mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.05]" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="space-y-8 text-center lg:text-left animate-fade-in-up">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full glass-card text-xs font-bold tracking-widest text-blue-300 uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Future of Campus Mobility
            </div>

            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black leading-tight tracking-tighter">
              Ride <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 drop-shadow-[0_0_30px_rgba(139,92,246,0.3)]">
                The Future
              </span>
            </h1>

            <p className="text-lg text-gray-400 max-w-xl leading-relaxed mx-auto lg:mx-0 font-medium">
              Experience the next generation of student transport. AI-powered scheduling, voice commands, and instant sharing.
            </p>

            <div className="flex flex-col sm:flex-row gap-5 justify-center lg:justify-start pt-4">
              <Link
                href="/login"
                className="btn-neon px-10 py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 group"
              >
                Start Riding
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#features"
                className="group px-10 py-5 glass-card rounded-2xl font-bold text-lg hover:bg-white/10 transition-all text-white flex items-center justify-center gap-2"
              >
                Watch Demo
                <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
              </a>
            </div>


          </div>

          {/* Hero Visual 3D */}
          <div className="relative group perspective-1000 animate-fade-in-up stagger-2">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-pink-500 rounded-[3rem] blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />

            {/* Glass Card */}
            <div className="relative glass-card rounded-[3rem] p-6 hover:rotate-y-2 hover:rotate-x-2 transition-transform duration-500 ease-out border-white/10">
              <div className="aspect-[4/3] rounded-[2.5rem] bg-gray-950 overflow-hidden relative border border-white/5 shadow-inner">
                {/* Simulated UI Content */}
                <div className="absolute top-0 w-full h-20 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-8 z-10">
                  <div className="w-24 h-5 bg-gray-800 rounded-full animate-pulse" />
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                    <Mic className="w-5 h-5 text-blue-400" />
                  </div>
                </div>

                {/* Map Visual */}
                <div className="absolute inset-0 bg-gray-900">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(59,130,246,0.1),_transparent_70%)]" />
                  {/* Grid Lines */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
                </div>

                {/* Center Pulse */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <div className="w-40 h-40 rounded-full border border-blue-500/20 flex items-center justify-center animate-ping-slow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    <div className="w-40 h-40 rounded-full border border-purple-500/20 flex items-center justify-center animate-ping-slow animation-delay-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    <div className="w-4 h-4 bg-blue-500 rounded-full shadow-[0_0_30px_rgba(59,130,246,1)] relative z-20 animate-bounce" />

                    {/* Driver Card Floating */}
                    <div className="absolute top-12 -right-12 glass-card p-4 rounded-2xl flex items-center gap-3 w-56 animate-float z-30">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full shadow-lg" />
                      <div>
                        <div className="h-2.5 w-24 bg-gray-600 rounded mb-1.5" />
                        <div className="h-2 w-16 bg-blue-500/50 rounded" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="absolute bottom-8 left-8 right-8 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:scale-105 transition-transform cursor-pointer">
                  Confirm Ride
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. NEON FEATURES GRID */}
      <section id="features" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20 space-y-4 animate-fade-in-up">
            <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">
              Future-Ready Features
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg font-medium">
              Everything you need for a smarter campus commute, wrapped in one powerful app.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className={`glass-card p-8 rounded-[2rem] group relative overflow-hidden animate-fade-in-up stagger-${(idx % 3) + 1}`}
              >
                {/* Hover Glow */}
                <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-20 blur-2xl transition-opacity duration-500" />

                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform duration-500 relative z-10">
                  {feature.icon}
                </div>

                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-blue-300 transition-colors relative z-10">
                  {feature.title}
                </h3>

                <p className="text-gray-400 leading-relaxed font-medium relative z-10">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. ABOUT SECTION */}
      <section id="about" className="py-32 relative">
        {/* Abstract BG */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-900/10 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="relative group perspective-1000 animate-fade-in-up">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-[2rem] opacity-30 blur-3xl group-hover:opacity-50 transition-all duration-700" />
            <div className="relative h-[600px] w-full glass-card rounded-[2rem] overflow-hidden flex items-center justify-center hover:rotate-y-2 transition-transform duration-500">
              <div className="absolute inset-0 bg-[url('/booking-illustration.png')] bg-cover bg-center opacity-100 mix-blend-normal hover:scale-105 transition-transform duration-[10s]" />
              <div className="absolute inset-0 bg-[url('/booking-illustration.png')] bg-cover bg-center opacity-100 mix-blend-normal hover:scale-105 transition-transform duration-[10s]" />
            </div>
          </div>

          <div className="space-y-10 animate-fade-in-up stagger-2">
            <h2 className="text-5xl font-black leading-tight">
              We're changing how <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-400">students move.</span>
            </h2>
            <div className="space-y-6 text-gray-400 text-xl font-medium leading-relaxed">
              <p>
                CampusRide isn't just an app; it's a movement to reclaim your time. No more waiting, no more haggling.
              </p>
              <p>
                By connecting students with trusted local drivers through AI-optimized routes, we are creating a safer, greener, and faster campus ecosystem.
              </p>
            </div>


          </div>
        </div>
      </section>

      {/* 5. CONTACT SECTION */}
      <section id="contact" className="py-32 relative overflow-hidden">
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-[1000px] h-[500px] bg-purple-900/20 rounded-full blur-[120px] -z-10" />

        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-5xl font-black mb-8 animate-fade-in-up">Get in Touch</h2>

          <div className="glass-card p-10 rounded-[3rem] shadow-2xl text-left animate-fade-in-up stagger-1 border-white/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

            <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="group">
                  <label className="block text-xs font-bold text-blue-300 mb-3 uppercase tracking-wider">Name</label>
                  <input type="text" suppressHydrationWarning className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white focus:border-blue-500 focus:bg-black/60 outline-none transition-all" placeholder="John Doe" />
                </div>
                <div className="group">
                  <label className="block text-xs font-bold text-blue-300 mb-3 uppercase tracking-wider">Email</label>
                  <input type="email" suppressHydrationWarning className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white focus:border-blue-500 focus:bg-black/60 outline-none transition-all" placeholder="john@university.edu" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-300 mb-3 uppercase tracking-wider">Message</label>
                <textarea rows={4} suppressHydrationWarning className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-white focus:border-blue-500 focus:bg-black/60 outline-none transition-all resize-none" placeholder="How can we help you?" />
              </div>

              <button suppressHydrationWarning className="btn-neon w-full py-5 rounded-2xl font-black text-lg shadow-xl hover:shadow-purple-500/30">
                Send Message
              </button>
            </form>
          </div>

          <div className="flex justify-center gap-12 mt-20 animate-fade-in-up stagger-2">
            {[
              { icon: Mail, text: "support@campusride.com" },
              { icon: MapPin, text: "Tech Park, Campus" },
              { icon: Phone, text: "+91 98765 43210" }
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-3 group cursor-pointer">
                <div className="w-14 h-14 rounded-full glass-card flex items-center justify-center group-hover:scale-110 group-hover:border-blue-500/50 transition-all shadow-lg">
                  <item.icon className="w-6 h-6 text-gray-400 group-hover:text-blue-400 transition-colors" />
                </div>
                <span className="text-xs font-bold text-gray-500 group-hover:text-white transition-colors">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t border-white/5 bg-black/50 backdrop-blur-lg text-center relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center gap-6">
          <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
            <span className="text-2xl">🛺</span>
            <span className="text-xl font-bold text-white">CampusRide</span>
          </div>

          <div className="flex gap-8 text-sm text-gray-500 font-medium">
            <a href="#" className="hover:text-blue-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-blue-400 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-blue-400 transition-colors">Driver Partners</a>
          </div>

          <p className="text-xs text-gray-700 font-mono">© 2026 CampusRide Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
