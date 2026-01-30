"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Trophy, Users, Lightbulb } from "lucide-react";

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-blue-500/30">

            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 py-4 px-6">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" /> Back to Home
                    </Link>
                    <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        CampusRide
                    </span>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -z-10" />

                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6 animate-fade-in-up">
                        <h1 className="text-5xl font-bold leading-tight">
                            Driven by Students, <br />
                            <span className="text-blue-500">For Students.</span>
                        </h1>
                        <p className="text-lg text-gray-400 leading-relaxed">
                            CampusRide was born from a simple idea: University commute shouldn't be a hassle.
                            We combine cutting-edge AI, real-time tracking, and community power to create the
                            safest and most efficient transportation network for campus life.
                        </p>

                        {/* Stats Removed */}
                    </div>

                    <div className="relative group">
                        <div className="absolute inset-0 bg-blue-500/20 rounded-3xl blur-xl" />
                        <img
                            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop"
                            alt="Team Brainstorming"
                            className="relative rounded-3xl border border-white/10 shadow-2xl w-full object-cover h-[400px]"
                        />
                    </div>
                </div>
            </section>

            {/* Mission & Vision */}
            <section className="py-20 bg-gray-900/50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="p-8 bg-gray-950 rounded-3xl border border-gray-800 hover:bg-gray-900 transition-colors">
                            <div className="w-12 h-12 bg-blue-900/30 rounded-xl flex items-center justify-center mb-6 text-blue-400">
                                <Lightbulb className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Our Mission</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                To revolutionize campus mobility by eliminating waiting times and ensuring every student reaches their class safely and on time.
                            </p>
                        </div>
                        <div className="p-8 bg-gray-950 rounded-3xl border border-gray-800 hover:bg-gray-900 transition-colors">
                            <div className="w-12 h-12 bg-purple-900/30 rounded-xl flex items-center justify-center mb-6 text-purple-400">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Community First</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                We believe in the power of sharing. Our platform encourages students to travel together, reducing costs and carbon footprint.
                            </p>
                        </div>
                        <div className="p-8 bg-gray-950 rounded-3xl border border-gray-800 hover:bg-gray-900 transition-colors">
                            <div className="w-12 h-12 bg-green-900/30 rounded-xl flex items-center justify-center mb-6 text-green-400">
                                <Trophy className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Excellence</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Committed to providing a premium experience with features like Voice Booking, AI Scheduling, and 24/7 Support.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="py-8 text-center text-gray-600 text-sm border-t border-gray-900">
                <p>© 2026 CampusRide. Driven by Innovation.</p>
            </footer>
        </div>
    );
}
