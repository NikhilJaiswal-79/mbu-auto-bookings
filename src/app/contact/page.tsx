"use client";

import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Send, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function ContactPage() {
    const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        // Logic to send email would go here
        setTimeout(() => setSubmitted(false), 3000);
    };

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

            <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-start relative">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] -z-10" />

                {/* Left: Contact Info */}
                <div className="space-y-8 animate-fade-in-up">
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
                            Let's Start a <br /><span className="text-blue-500">Conversation.</span>
                        </h1>
                        <p className="text-gray-400 text-lg">
                            Have a question about rides, refunds, or technical issues? Our support team is here for you 24/7.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-2xl border border-gray-800 hover:border-blue-500/30 transition-colors">
                            <div className="w-12 h-12 bg-blue-900/40 rounded-full flex items-center justify-center text-blue-400 shrink-0">
                                <Mail className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">Email Us</h3>
                                <p className="text-gray-400 text-sm">support@campusride.com</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-2xl border border-gray-800 hover:border-purple-500/30 transition-colors">
                            <div className="w-12 h-12 bg-purple-900/40 rounded-full flex items-center justify-center text-purple-400 shrink-0">
                                <Phone className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">Call Center</h3>
                                <p className="text-gray-400 text-sm">+91 98765 43210</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-2xl border border-gray-800 hover:border-green-500/30 transition-colors">
                            <div className="w-12 h-12 bg-green-900/40 rounded-full flex items-center justify-center text-green-400 shrink-0">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">Campus HQ</h3>
                                <p className="text-gray-400 text-sm">Mohan Babu University, SV Road, Tirupati</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Contact Form */}
                <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -z-0" />

                    <h2 className="text-2xl font-bold text-white mb-6 relative z-10">Send a Message</h2>

                    <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Your Name</label>
                                <input
                                    type="text"
                                    placeholder="John Doe"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white text-sm focus:border-blue-500 transition-colors outline-none"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Email Address</label>
                                <input
                                    type="email"
                                    placeholder="john@college.edu"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white text-sm focus:border-blue-500 transition-colors outline-none"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Subject</label>
                            <select
                                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white text-sm focus:border-blue-500 transition-colors outline-none"
                                value={formData.subject}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                            >
                                <option value="">Select a topic...</option>
                                <option value="Refund">Refund Request</option>
                                <option value="Technical">App Issue</option>
                                <option value="Driver">Driver Complaint</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Message</label>
                            <textarea
                                rows={5}
                                placeholder="Tell us more regarding your query..."
                                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white text-sm focus:border-blue-500 transition-colors outline-none resize-none"
                                value={formData.message}
                                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                required
                            ></textarea>
                        </div>

                        <button
                            type="submit"
                            disabled={submitted}
                            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${submitted ? "bg-green-600 cursor-default" : "bg-blue-600 hover:bg-blue-500"}`}
                        >
                            {submitted ? <><CheckCircle2 className="w-5 h-5" /> Message Sent!</> : <><Send className="w-5 h-5" /> Send Message</>}
                        </button>
                    </form>
                </div>
            </section>

            <footer className="py-8 text-center text-gray-600 text-sm border-t border-gray-900">
                <p>© 2026 CampusRide. Driven by Innovation.</p>
            </footer>
        </div>
    );
}
