"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icons in Next.js/Leaflet
const iconUrl = "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png";
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png";

const customIcon = new L.Icon({
    iconUrl,
    iconRetinaUrl,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

// Component to handle map clicks
function MapEvents({ onLocationSelect }: { onLocationSelect?: (lat: number, lng: number, address: string) => void }) {
    const map = useMapEvents({
        click: async (e) => {
            const { lat, lng } = e.latlng;
            // Reverse Geocoding via OpenStreetMap (Nominatim)
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await res.json();
                const address = data.display_name || "Unknown Location";

                // Add marker at clicked location
                L.marker([lat, lng], { icon: customIcon }).addTo(map)
                    .bindPopup(address)
                    .openPopup();

                if (onLocationSelect) {
                    onLocationSelect(lat, lng, address);
                }
            } catch (error) {
                console.error("Geocoding failed", error);
            }
        },
    });
    return null;
}

function LocationMarker() {
    const [position, setPosition] = useState<L.LatLng | null>(null);
    const map = useMap();

    useEffect(() => {
        map.locate().on("locationfound", function (e) {
            setPosition(e.latlng);
            map.flyTo(e.latlng, map.getZoom());
        });
    }, [map]);

    return position === null ? null : (
        <Marker position={position} icon={customIcon}>
            <Popup>You are here</Popup>
        </Marker>
    );
}

interface MapProps {
    className?: string;
    onLocationSelect?: (lat: number, lng: number, address: string) => void;
}

export default function MapComponent({ className, onLocationSelect }: MapProps) {
    // Default Center: Rangampeta / MBU Area
    const defaultCenter = { lat: 13.6288, lng: 79.4192 };

    return (
        <MapContainer
            center={defaultCenter}
            zoom={13}
            scrollWheelZoom={false}
            className={`w-full h-full rounded-2xl z-0 ${className}`}
            style={{ minHeight: "300px" }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={defaultCenter} icon={customIcon}>
                <Popup>
                    MBU Campus <br /> Rangampeta
                </Popup>
            </Marker>
            <LocationMarker />
            <MapEvents onLocationSelect={onLocationSelect} />
        </MapContainer>
    );
}
