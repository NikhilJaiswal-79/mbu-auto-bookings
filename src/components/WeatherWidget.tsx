"use client";

import { useEffect, useState } from "react";

export default function WeatherWidget() {
    const [weather, setWeather] = useState("Sunny");
    const [temp, setTemp] = useState("28");
    const [forecast, setForecast] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWeather = async () => {
            const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
            // MBU Campus Coordinates (Approx)
            const lat = "13.6288";
            const lon = "79.4192";

            if (!apiKey) {
                console.warn("No Weather API Key.");
                setLoading(false);
                return;
            }

            try {
                // Fetch Current Weather
                const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`);
                const weatherData = await weatherRes.json();
                if (weatherData.weather && weatherData.main) {
                    setWeather(weatherData.weather[0].main);
                    setTemp(Math.round(weatherData.main.temp).toString());
                }

                // Fetch Forecast
                const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`);
                const forecastData = await forecastRes.json();
                if (forecastData.list) {
                    // Get next 4 intervals (3 hours each = 12 hours)
                    setForecast(forecastData.list.slice(0, 4));
                }

            } catch (error) {
                console.error("Weather fetch failed", error);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();
    }, []);

    const getWeatherIcon = (condition: string) => {
        if (condition.includes("Clear")) return "☀️";
        if (condition.includes("Cloud")) return "☁️";
        if (condition.includes("Rain")) return "🌧️";
        if (condition.includes("Drizzle")) return "🌦️";
        if (condition.includes("Thunder")) return "⛈️";
        return "🌤️";
    };

    if (loading) return <div className="text-gray-500 text-xs animate-pulse">Loading weather...</div>;

    return (
        <div className="bg-[#1e1b4b] rounded-3xl p-6 text-white shadow-xl border border-white/5 animate-fade-in mb-8 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full pointer-events-none"></div>

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600/30 flex items-center justify-center border border-blue-500/50">
                        📍
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Mohan Babu University</h3>
                        <p className="text-blue-300 text-sm">Tirupati • Just Updated</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                        <span className="text-3xl">{getWeatherIcon(weather)}</span>
                        <span className="text-xl font-medium">{weather}</span>
                    </div>
                </div>
            </div>

            {/* Forecast Section */}
            <div>
                <h4 className="text-xs text-gray-400 font-bold mb-4 uppercase tracking-wider">Next 12 Hours</h4>
                <div className="grid grid-cols-4 gap-4">
                    {forecast.map((item, index) => (
                        <div key={index} className="bg-[#2e2a5b] p-3 rounded-2xl text-center border border-white/5 hover:bg-[#37336b] transition-colors">
                            <p className="text-xs text-gray-400 font-bold mb-1">
                                {new Date(item.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <div className="text-2xl my-2">{getWeatherIcon(item.weather[0].main)}</div>
                            <p className="text-xs text-blue-200">{item.weather[0].main}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
