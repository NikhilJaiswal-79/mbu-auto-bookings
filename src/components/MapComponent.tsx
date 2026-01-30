"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline } from "react-leaflet";
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
    pickup?: { lat: number; lng: number } | null;
    drop?: { lat: number; lng: number } | null;
    waypoints?: { lat: number; lng: number; label?: string }[];
}

export default function MapComponent({ className, onLocationSelect, pickup, drop, waypoints = [] }: MapProps) {
    // Default Center: Rangampeta / MBU Area
    const defaultCenter = { lat: 13.6288, lng: 79.4192 };

    const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

    // Fetch Route when pickup and drop are available
    useEffect(() => {
        if (pickup && drop) {
            const fetchRoute = async () => {
                try {
                    // OSRM Public API (Driving)
                    // URL Format: /route/v1/driving/{lon},{lat};{lon},{lat}?overview=full&geometries=geojson

                    // Construct coordinate string: pickup -> waypoints -> drop
                    // Waypoints should be visited in order.
                    // If waypoints exist, add them between pickup and drop.

                    let coordsString = `${pickup.lng},${pickup.lat}`;

                    if (waypoints && waypoints.length > 0) {
                        const waypointsStr = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(";");
                        coordsString += `;${waypointsStr}`;
                    }

                    coordsString += `;${drop.lng},${drop.lat}`;

                    const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

                    const res = await fetch(url);
                    const data = await res.json();

                    if (data.routes && data.routes.length > 0) {
                        const coords = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]); // Swap Lon/Lat to Lat/Lon
                        setRouteCoords(coords);
                    }
                } catch (error) {
                    console.error("Error fetching route:", error);
                }
            };
            fetchRoute();
        } else {
            setRouteCoords([]);
        }
    }, [pickup, drop, waypoints]);

    // Component to Fit Bounds
    function BoundsHandler({ coords }: { coords: [number, number][] }) {
        const map = useMap();
        useEffect(() => {
            if (coords.length > 0) {
                const bounds = L.latLngBounds(coords.map(c => [c[0], c[1]]));
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }, [coords, map]);
        return null;
    }

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
            {/* Markers */}
            {pickup && (
                <Marker position={pickup} icon={customIcon}>
                    <Popup>📍 Pickup Location</Popup>
                </Marker>
            )}

            {waypoints && waypoints.map((wp, i) => (
                <Marker key={i} position={wp} icon={customIcon}>
                    <Popup>🛑 Stop {i + 1}: {wp.label || "Waypoint"}</Popup>
                </Marker>
            ))}

            {drop && (
                <Marker position={drop} icon={customIcon}>
                    <Popup>🏁 Drop Location</Popup>
                </Marker>
            )}

            {/* Route Polyline */}
            {routeCoords.length > 0 && (
                <Polyline positions={routeCoords} color="blue" weight={5} opacity={0.7} />
            )}

            {!pickup && !drop && (
                <Marker position={defaultCenter} icon={customIcon}>
                    <Popup>
                        MBU Campus <br /> Rangampeta
                    </Popup>
                </Marker>
            )}

            <LocationMarker />
            <MapEvents onLocationSelect={onLocationSelect} />
            <BoundsHandler coords={routeCoords} />
        </MapContainer>
    );
}
