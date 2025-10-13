import './app.css';
import React, { useState, useRef } from 'react';

function App() {
    const [location, setLocation] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [coords, setCoords] = useState({ lat: null, lon: null });
    const [rainFore, setRainFore] = useState("");
    const [tempFore, setTempFore] = useState("");
    const [humFore, setHumFore] = useState("");
    const [aiSuggestion, setAiSuggestion] = useState("");

    const fetchTimeout = useRef(null);

    //THIS SECTION MAKES IT PONCTUATION AND CASE INSENSTIVE
    const normalizeForQuery = (str) => {
        if (!str) return "";
        const noAccents = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const clean = noAccents.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
        return clean;
    };

    //CONSTANTS FOR THE FORMAT OF THE SUGGESITONS
    const formatPlaceLabel = (place) => {
        const addr = place.address || {};
        const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality;
        const county = addr.county;
        const state = addr.state || addr.region;
        const country = addr.country;

        //FORMAT THE SUGGESITONS FOR THE CITY / STATE / COUNTRY FORMAT
        if (city && state) return `${city}, ${state}${country ? ', ' + country : ''}`;
        if (city && country) return `${city}, ${country}`;
        if (city && county) return `${city}, ${county}${country ? ', ' + country : ''}`;
        if (state && country) return `${state}, ${country}`;
        if (county && country) return `${county}, ${country}`;

        //SLICE THE DISPLAY NAME WITH COMMA
        if (place.display_name) {
            const parts = place.display_name.split(',').map(p => p.trim()).filter(Boolean);
            return parts.slice(0, 3).join(', ');
        }

        return place.type ? `${place.type}` : 'Unknown place';
    };
    //STARTS THE SUGGESTIONS AFTER 3 CHARACTERS
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
            //API CALL FOR SUGGESTIONS, LIMIT 10 BUT ONLY SHOW 5
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(normalized)}`
            );
            const data = await res.json();

            //FORMAT IT TO LABELS, IMPORTANT TO TURN IT INTO LATITUDES AND LONGITUDES
            const labels = data.map(formatPlaceLabel);

            //AVOIDING DUPLICATES
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

            //SAVE COORDS RESULTS 
            if (data.length > 0) {
                setCoords({ lat: data[0].lat, lon: data[0].lon });
            }
        } catch (err) {
            console.error("Error fetching suggestions:", err);
            setSuggestions([]);
        }
    };

    // DEBOUCE WRAPPER
    const onLocationChange = (text) => {
        setLocation(text);
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        fetchTimeout.current = setTimeout(() => fetchSuggestions(text), 260);
    };

    //IF NO LOCATION WAS SELECTED
    const fetchWeather = async () => {
        if (!coords.lat || !coords.lon) {
            alert("Please select a location first.");
            return;
        }
        //GETS TODAY TIME FOR THE APICALL
        const today = new Date();
        const startDate = today.toISOString().split("T")[0];
        const endDate = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000)//GET THE FINAL DATE OF THE WEEK
            .toISOString()
            .split("T")[0];
        //API CALL FOR WEATHER
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=precipitation_sum,temperature_2m_max,relative_humidity_2m_mean&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
            const res = await fetch(url);
            const data = await res.json();

            const days = data.daily.time;
            const rain = data.daily.precipitation_sum;
            const temps = data.daily.temperature_2m_max;
            const humidity = data.daily.relative_humidity_2m_mean;

            //RAIN ANALYSIS, CHANGIGN THIS SECTION FOR BETTER FORMAT. CURRENT SECTION OF SHOWING IS SIMPLY FOR TESTING PURPOSES
            let rainyDays = [];
            for (let i = 0; i < 7; i++) {
                if (rain[i] >= 2.5) {
                    rainyDays.push(days[i]);
                }
            }
            const rainSummary =
                rainyDays.length > 3
                    ? "Expect rainy day(s)."
                    : "Expect dry day(s).";
            const rainDetail =
                rainyDays.length > 0
                    ? ` It is expected to rain on: ${rainyDays.join(", ")}.`
                    : " No relevant rain is expected for the week";
            setRainFore(rainSummary + rainDetail);

            //TEMP ANALYSIS
            const avgTemp = temps.reduce((sum, val) => sum + val, 0) / temps.length;
            const tempSummary =
                avgTemp > 26.6 // ~80°F
                    ? `Expect warm day(s). The expect average temperature is ${avgTemp.toFixed(1)}°C or ${((avgTemp.toFixed(1) * 1.8) + 32).toFixed(1)} °F.`
                    : `Expect cold day(s). The expect average temperature is ${avgTemp.toFixed(1)}°C or ${((avgTemp.toFixed(1) * 1.8) + 32).toFixed(1)} °F.`;
            setTempFore(tempSummary);

            //HUM ANALYSIS
            const avgHum = humidity.reduce((sum, val) => sum + val, 0) / humidity.length;
            const humSummary =
                avgHum > 50
                    ? `Expect humid day(s). The expect average humidity is ${avgHum.toFixed(0)}%.`
                    : `Expect dry day(s). The expect average humidity is ${avgHum.toFixed(0)}%.`;
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
                <div className="searchplace" style={{ position: "relative", flex: 1 }}>
                    <input
                        type="text"
                        value={location}
                        placeholder="Where are you going?"
                        onChange={(e) => onLocationChange(e.target.value)}
                        style={{ width: "100%", padding: "8px" }}
                    />

                    {suggestions.length > 0 && (
                        <ul
                            style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                right: 0,
                                background: "white",
                                border: "1px solid #ccc",
                                maxHeight: "180px",
                                overflowY: "auto",
                                margin: 0,
                                padding: 0,
                                listStyle: "none",
                                zIndex: 1000,
                            }}
                        >
                            {suggestions.slice(0, 5).map((s, i) => (
                                <li
                                    key={i}
                                    onClick={() => {
                                        setLocation(s);
                                        setSuggestions([]);
                                    }}
                                    style={{
                                        padding: "8px",
                                        cursor: "pointer",
                                        borderBottom: "1px solid #eee",
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
            </div>

            {/* --- Weather summary output --- */}
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
