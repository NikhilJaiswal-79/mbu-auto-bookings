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
            const city = "Rangampeta, Andhra Pradesh, IN";

            if (!apiKey) {
                console.warn("No Weather API Key.");
                setLoading(false);
                return;
            }

            try {
                // Fetch Current Weather
                const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`);
                const weatherData = await weatherRes.json();
                if (weatherData.weather && weatherData.main) {
                    setWeather(weatherData.weather[0].main);
                    setTemp(Math.round(weatherData.main.temp).toString());
                }

                // Fetch Forecast
                const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&appid=${apiKey}`);
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
        <div className="mb-6">
            {/* Main Weather Card */}
            <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-4 rounded-xl flex items-center justify-between shadow-lg border border-blue-700/50 mb-3">
                <div>
                    <h3 className="text-white font-bold flex items-center gap-2">
                        MBU Campus
                        <span className="text-xs bg-blue-700 px-2 py-0.5 rounded-full text-blue-200">Live</span>
                    </h3>
                    <p className="text-blue-200 text-sm">Rangampeta</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-white flex items-center gap-2 justify-end">
                        {getWeatherIcon(weather)} {weather}
                    </p>
                    <p className="text-xs text-blue-200">{temp}°C</p>
                </div>
            </div>

            {/* Forecast Section */}
            <h4 className="text-xs text-gray-400 font-bold mb-2 uppercase tracking-wider">Next 12 Hours</h4>
            <div className="grid grid-cols-4 gap-2">
                {forecast.map((item, index) => (
                    <div key={index} className="bg-gray-800 p-2 rounded-lg text-center border border-gray-700">
                        <p className="text-xs text-gray-400 font-bold">
                            {new Date(item.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <div className="text-xl my-1">{getWeatherIcon(item.weather[0].main)}</div>
                        <p className="text-xs text-white font-bold">{Math.round(item.main.temp)}°C</p>
                        <p className="text-[10px] text-gray-500">{item.weather[0].main}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
