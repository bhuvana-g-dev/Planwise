import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Venue } from "../types";
import { formatINR } from "../utils/format";

// Fix Leaflet's default marker icon paths under Vite bundling.
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const SelectedIcon = L.icon({
  iconUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [33, 54],
  iconAnchor: [16, 54],
  popupAnchor: [1, -44],
  shadowSize: [54, 54],
  className: "hue-rotate-[260deg]",
});

// Source-specific honesty label. Never implies verification the data lacks.
export function sourceLabelText(source: Venue["source"]): string {
  switch (source) {
    case "osm":
      return "OpenStreetMap data (© OSM contributors) — price, capacity & availability may be unknown; verify with the venue";
    case "user":
      return "User-provided entry — not externally verified";
    case "provider":
      return "Provider data — verify details with the venue";
    case "demo":
    default:
      return "Demo venue — illustrative & unverified, not a real listing";
  }
}

function SourceLabel({ source }: { source: Venue["source"] }) {
  const tone = source === "osm" ? "text-sky-700" : "text-amber-600";
  return (
    <p className={`text-[10px] uppercase tracking-wide ${tone}`}>
      {sourceLabelText(source)}
    </p>
  );
}

function Recenter({ venue }: { venue: Venue | null }) {
  const map = useMap();
  useEffect(() => {
    if (venue && venue.lat != null && venue.lng != null) {
      map.setView([venue.lat, venue.lng], 13, { animate: true });
    }
  }, [venue, map]);
  return null;
}

export default function VenueMap({
  venues,
  focused,
  onFocus,
}: {
  venues: Venue[];
  focused: Venue | null;
  onFocus: (v: Venue) => void;
}) {
  const withCoords = venues.filter((v) => v.lat != null && v.lng != null);
  const center: [number, number] =
    withCoords.length > 0
      ? [withCoords[0].lat as number, withCoords[0].lng as number]
      : [9.9252, 78.1198]; // Madurai fallback

  if (withCoords.length === 0) {
    return (
      <div className="card flex h-full min-h-[320px] items-center justify-center p-6 text-center text-sm text-slate-500">
        None of the current venues have coordinates to plot. Try different
        filters, or add coordinates when entering a venue manually.
      </div>
    );
  }

  return (
    <div className="h-[520px] overflow-hidden rounded-2xl border border-slate-200">
      <MapContainer center={center} zoom={11} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter venue={focused} />
        {withCoords.map((v) => (
          <Marker
            key={v.id}
            position={[v.lat as number, v.lng as number]}
            icon={focused?.id === v.id ? SelectedIcon : DefaultIcon}
            eventHandlers={{ click: () => onFocus(v) }}
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">{v.name}</p>
                {v.location && (
                  <p className="text-xs text-slate-500">{v.location}</p>
                )}
                <p className="text-xs">
                  {v.capacity > 0
                    ? `Capacity ${v.capacity}`
                    : "Capacity not listed"}{" "}
                  ·{" "}
                  {v.est_price_paise != null
                    ? formatINR(v.est_price_paise)
                    : "price not listed"}
                </p>
                <SourceLabel source={v.source} />
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
