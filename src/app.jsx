import './app.css';
import React, { useState, useRef } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

function App() {
    const geminiApi = import.meta.env.VITE_GEMINI_API_KEY;
    const ai = new GoogleGenerativeAI(geminiApi);

    const [location, setLocation] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [coords, setCoords] = useState({ lat: null, lon: null });
    const [rainFore, setRainFore] = useState("");
    const [tempFore, setTempFore] = useState("");
    const [humFore, setHumFore] = useState("");
    const [aiSuggestion, setAiSuggestion] = useState("Select a place to start.");

    const fetchTimeout = useRef(null);

    const normalizeForQuery = (str) => {
        if (!str) return "";
        const noAccents = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const clean = noAccents.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
        return clean;
    };

    const formatPlaceLabel = (place) => {
        const addr = place.address || {};
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality;
        const county = addr.county;
        const state = addr.state || addr.region;
        const country = addr.country;

        if (city && state) return `${city}, ${state}${country ? ', ' + country : ''}`;
        if (city && country) return `${city}, ${country}`;
        if (city && county) return `${city}, ${county}${country ? ', ' + country : ''}`;
        if (state && country) return `${state}, ${country}`;
        if (county && country) return `${county}, ${country}`;

        if (place.display_name) {
            const parts = place.display_name.split(',').map(p => p.trim()).filter(Boolean);
            return parts.slice(0, 3).join(', ');
        }

        return place.type ? `${place.type}` : 'Unknown place';
    };

    const fetchSuggestions = async (query) => {
        if (!query || query.trim().length < 3) {
            setSuggestions([]);
            return;
        }

        const normalized = normalizeForQuery(query);
        if (!normalized || normalized.length < 3) {
            setSuggestions([]);
            return;
        }

        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(normalized)}`
            );
            const data = await res.json();

            const labels = data.map(formatPlaceLabel);
            const seen = new Set();
            const unique = [];
            for (const lab of labels) {
                const key = lab
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^\p{L}\p{N}\s-]/gu, '')
                    .replace(/\s+/g, ' ').trim();

                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(lab);
                }
            }

            setSuggestions(unique);

            if (data.length > 0) {
                setCoords({ lat: data[0].lat, lon: data[0].lon });
            }
        } catch (err) {
            console.error("Error fetching suggestions:", err);
            setSuggestions([]);
        }
    };

    const onLocationChange = (text) => {
        setLocation(text);
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        fetchTimeout.current = setTimeout(() => fetchSuggestions(text), 260);
    };

    const fetchWeather = async () => {
        if (!coords.lat || !coords.lon) {
            alert("Please select a location first.");
            return;
        }

        setAiSuggestion("Fetching AI suggestion...");

        try {
            const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent(
                `You are a traveler helper. Big paragraph with instructions to travelers going to ${location} of what they should be aware of. Give only usual precautions of the place, for example that you should always carry an umbrella in Belem do Para because it rains everyday. Do that in mind that they are going this week, so pay attention to what season we are or currect general climates or natural disasters, without being specific about the date.`
            );
            const suggestionText = result.response.text();
            setAiSuggestion(suggestionText);
        } catch (err) {
            console.error("Error calling Gemini API:", err);
            setAiSuggestion("AI suggestion unavailable. Please try again later.");
        }

        const today = new Date();
        const startDate = today.toISOString().split("T")[0];
        const endDate = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=precipitation_sum,temperature_2m_max,relative_humidity_2m_mean&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
            const res = await fetch(url);
            const data = await res.json();

            const days = data.daily.time;
            const rain = data.daily.precipitation_sum;
            const temps = data.daily.temperature_2m_max;
            const humidity = data.daily.relative_humidity_2m_mean;

            const rainyDays = days.filter((_, i) => rain[i] >= 2.5);
            const rainSummary =
                rainyDays.length > 3
                    ? "Expect rainy day(s)."
                    : "Expect dry day(s).";
            const rainDetail =
                rainyDays.length > 0
                    ? ` It is expected to rain on: ${rainyDays.join(", ")}.`
                    : " No relevant rain is expected for the week.";
            setRainFore(rainSummary + rainDetail);

            const avgTemp = temps.reduce((sum, val) => sum + val, 0) / temps.length;
            const tempSummary =
                avgTemp > 26.6
                    ? `Expect warm day(s). Average temperature: ${avgTemp.toFixed(1)}°C (${((avgTemp * 1.8) + 32).toFixed(1)} °F).`
                    : `Expect cool day(s). Average temperature: ${avgTemp.toFixed(1)}°C (${((avgTemp * 1.8) + 32).toFixed(1)} °F).`;
            setTempFore(tempSummary);

            const avgHum = humidity.reduce((sum, val) => sum + val, 0) / humidity.length;
            const humSummary =
                avgHum > 50
                    ? `Expect humid day(s). Average humidity: ${avgHum.toFixed(0)}%.`
                    : `Expect dry day(s). Average humidity: ${avgHum.toFixed(0)}%.`;
            setHumFore(humSummary);
        } catch (err) {
            console.error("Error fetching weather:", err);
        }
    };

    return (
        <>
            <div className="header">
                <h1>What's the weather?</h1>
            </div>

            <div className="searchbar">
                <div className="searchplace">
                    <input
                        className="input"
                        type="text"
                        value={location}
                        placeholder="Where are you going?"
                        onChange={(e) => onLocationChange(e.target.value)}
                    />

                    {suggestions.length > 0 && (
                        <ul className="suggestion-list">
                            {suggestions.slice(0, 5).map((s, i) => (
                                <li
                                    className="suggestion-item"
                                    key={i}
                                    onClick={() => {
                                        setLocation(s);
                                        setSuggestions([]);
                                    }}
                                >
                                    {s}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="searchbutton">
                    <button onClick={fetchWeather}>Search</button>
                </div>
            </div>

            <div className="aisuggestion">
                <div className="upbar">
                    <p>AISuggestion</p>
                </div>
                <div className="aicontent">
                    <p>{aiSuggestion}</p>
                </div>
            </div>

            <div className="rain">
                {rainFore && <p>{rainFore}</p>}
            </div>

            <div className="temp">
                {tempFore && <p>{tempFore}</p>}
            </div>

            <div className="humidity">
                {humFore && <p>{humFore}</p>}
            </div>
        </>
    );
}

export default App;
