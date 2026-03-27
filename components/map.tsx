'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Motero {
  id: string;
  coordinates: [number, number];
}

interface AddressSuggestion {
  id: string;
  placeName: string;
}
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type MapPickTarget = 'origin' | 'destination' | null;

export default function MapComponent() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const myLocationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const mapPickTargetRef = useRef<MapPickTarget>(null);
  const [moterosData, setMoterosData] = useState<Motero[]>([
    { id: 'motero_1', coordinates: [-74.1338, 4.6009] },
    { id: 'motero_2', coordinates: [-74.1338 + 0.0002, 4.6009 + 0.0002] },
    { id: 'motero_3', coordinates: [-74.1338 + 0.0004, 4.6009 + 0.0004] },
    { id: 'motero_4', coordinates: [-74.1338 + 0.0006, 4.6009 + 0.0006] },
    { id: 'motero_5', coordinates: [-74.1338 + 0.0008, 4.6009 + 0.0008] },
    { id: 'motero_6', coordinates: [-74.1338 + 0.0010, 4.6009 + 0.0010] },
    { id: 'motero_7', coordinates: [-74.1338 + 0.0012, 4.6009 + 0.0012] },
  ]);

  const [origin, setOrigin] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState<string>('');
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [useCurrentLocationAsOrigin, setUseCurrentLocationAsOrigin] = useState(false);
  const [destinationSuggestions, setDestinationSuggestions] = useState<AddressSuggestion[]>([]);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [mapPickTarget, setMapPickTarget] = useState<MapPickTarget>(null);

  mapboxgl.accessToken = MAPBOX_TOKEN;

  useEffect(() => {
    mapPickTargetRef.current = mapPickTarget;
  }, [mapPickTarget]);

  const getRoute = async (start: [number, number], end: [number, number]) => {
    if (!map.current) return;

    const query = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&geometries=geojson&access_token=${MAPBOX_TOKEN}`
    );
    const json = await query.json();
    const data = json.routes[0];
    const route = data.geometry.coordinates;

    const geojson: GeoJSON.Feature<GeoJSON.Geometry> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route,
      },
    };

    if (map.current.getSource('route')) {
      (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData(geojson);
    } else {
      map.current.addLayer({
        id: 'route',
        type: 'line',
        source: {
          type: 'geojson',
          data: geojson,
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#3887be',
          'line-width': 5,
          'line-opacity': 0.75,
        },
      });
    }
  };

  const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
    const coordinatesPattern = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
    const coordinateMatch = address.match(coordinatesPattern);
    if (coordinateMatch) {
      return [Number(coordinateMatch[1]), Number(coordinateMatch[2])];
    }

    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}`
    );
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].center as [number, number];
    }
    return null;
  };

  const reverseGeocode = async (lng: number, lat: number): Promise<string> => {
    // Para que el usuario reciba coordenadas directamente al hacer clic:
    // usamos formato compatible con `geocodeAddress` (lng, lat).
    return `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
  };

  const fetchAddressSuggestions = async (query: string) => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3) {
      setDestinationSuggestions([]);
      return;
    }

    setIsDestinationLoading(true);
    try {
      const proximity = currentLocation ? `&proximity=${currentLocation[0]},${currentLocation[1]}` : '';
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmedQuery)}.json?autocomplete=true&limit=5&language=es&country=co${proximity}&access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();

      if (!data.features) {
        setDestinationSuggestions([]);
        return;
      }

      const suggestions: AddressSuggestion[] = data.features.map((feature: { id: string; place_name: string }) => ({
        id: feature.id,
        placeName: feature.place_name,
      }));
      setDestinationSuggestions(suggestions);
    } catch (error) {
      console.warn('No se pudieron cargar sugerencias de destino:', error);
      setDestinationSuggestions([]);
    } finally {
      setIsDestinationLoading(false);
    }
  };

  const handleGetDirections = async () => {
    if ((!origin && !useCurrentLocationAsOrigin) || !destination) return;

    const originCoords = useCurrentLocationAsOrigin
      ? currentLocation
      : await geocodeAddress(origin);
    const destCoords = await geocodeAddress(destination);

    if (originCoords && destCoords) {
      await getRoute(originCoords, destCoords);

      // Add markers for origin and destination
      if (map.current) {
        // Remove existing markers
        const existingMarkers = document.querySelectorAll('.direction-marker');
        existingMarkers.forEach((marker) => marker.remove());

        // Origin marker
        const originEl = document.createElement('div');
        originEl.className = 'direction-marker';
        originEl.style.cssText = 'width: 20px; height: 20px; background: #00ff00; border-radius: 50%; border: 3px solid white;';
        new mapboxgl.Marker(originEl).setLngLat(originCoords).addTo(map.current);

        // Destination marker
        const destEl = document.createElement('div');
        destEl.className = 'direction-marker';
        destEl.style.cssText = 'width: 20px; height: 20px; background: #ff0000; border-radius: 50%; border: 3px solid white;';
        new mapboxgl.Marker(destEl).setLngLat(destCoords).addTo(map.current);

        // Fit map to show the route
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend(originCoords);
        bounds.extend(destCoords);
        map.current.fitBounds(bounds, { padding: 50 });
      }
    }
  };

  const handleAddAddress = () => {
    const trimmedAddress = newAddress.trim();
    if (!trimmedAddress) return;

    setSavedAddresses((prev) => {
      if (prev.includes(trimmedAddress)) return prev;
      return [...prev, trimmedAddress];
    });
    setNewAddress('');
  };

  const requestCurrentLocationForOrigin = () => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
        setCurrentLocation(coords);
        setUseCurrentLocationAsOrigin(true);
        setOrigin('Mi ubicacion actual');

        if (map.current) {
          if (!myLocationMarkerRef.current) {
            myLocationMarkerRef.current = new mapboxgl.Marker({ color: '#2563eb' }).setLngLat(coords).addTo(map.current);
          } else {
            myLocationMarkerRef.current.setLngLat(coords);
          }
          map.current.flyTo({ center: coords, zoom: 15 });
        }
      },
      (error) => {
        console.warn('No se pudo obtener la ubicacion actual:', error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );
  };

  useEffect(() => {
    if (!mapContainer.current) return;
    let watchId: number | null = null;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.1338, 4.6009],
      zoom: 14,
    });

    map.current.on('load', () => {
      if (!map.current) return;

      const moterosGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: moterosData.map((motero) => ({
          type: 'Feature' as const,
          properties: { id: motero.id },
          geometry: {
            type: 'Point' as const,
            coordinates: motero.coordinates,
          },
        })),
      };

      map.current.addSource('moteros-source', {
        type: 'geojson',
        data: moterosGeoJSON,
      });

      map.current.addLayer({
        id: 'puntos-moteros',
        type: 'circle',
        source: 'moteros-source',
        paint: {
          'circle-radius': 9,
          'circle-color': '#FF0000',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FFFFFF',
        },
      });

      // Navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

      // Geolocation
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const { longitude, latitude } = position.coords;
            setCurrentLocation([longitude, latitude]);
            setMoterosData((prev) => {
              const updated = [...prev];
              updated[0] = { id: 'motero_1', coordinates: [longitude, latitude] };
              return updated;
            });
          },
          (error) => {
            console.warn('No se pudo obtener la ubicacion:', error.message);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 10000,
          }
        );
      }

      map.current.on('click', async (e) => {
        const target = mapPickTargetRef.current;
        if (!target || !map.current) return;
        const { lng, lat } = e.lngLat;
        const label = await reverseGeocode(lng, lat);
        if (target === 'origin') {
          setOrigin(label);
          setUseCurrentLocationAsOrigin(false);
        } else {
          setDestination(label);
        }
        setMapPickTarget(null);
      });
    });

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (map.current) {
        map.current.remove();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const source = map.current.getSource('moteros-source');
    if (source && source.type === 'geojson') {
      const moterosGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: moterosData.map((motero) => ({
          type: 'Feature' as const,
          properties: { id: motero.id },
          geometry: {
            type: 'Point' as const,
            coordinates: motero.coordinates,
          },
        })),
      };
      (source as mapboxgl.GeoJSONSource).setData(moterosGeoJSON);
    }
  }, [moterosData]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAddressSuggestions(destination);
    }, 300);

    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, currentLocation]);

  return (
    <div className="relative w-full h-screen">
      <div
        ref={mapContainer}
        className={`w-full h-full ${mapPickTarget ? 'cursor-crosshair' : ''}`}
        style={{ position: 'absolute', top: 0, bottom: 0 }}
      />
      
      {/* Info Panel */}
      <div className="absolute top-2.5 left-2.5 z-10 bg-white p-3 rounded-lg shadow-md">
        <p className="font-semibold text-sm">Sala: MOTO-7721</p>
        <p className="text-xs text-gray-600">Simulando movimiento...</p>
      </div>

      {/* Directions Panel */}
      <div className="absolute top-2.5 right-2.5 z-10 bg-white p-3 rounded-lg shadow-md w-72">
        <p className="font-semibold text-sm mb-2">Direcciones</p>
        <input
          type="text"
          placeholder="Origen"
          value={origin}
          onChange={(e) => {
            setOrigin(e.target.value);
            setUseCurrentLocationAsOrigin(false);
          }}
          className="w-full p-2 border border-gray-300 rounded mb-2 text-sm"
        />
        <button
          onClick={requestCurrentLocationForOrigin}
          className="w-full bg-slate-700 text-white p-2 rounded text-sm hover:bg-slate-800 transition-colors mb-2"
        >
          Usar mi ubicacion como origen
        </button>

        <div className="mb-2 rounded border border-dashed border-gray-300 p-2">
          <p className="mb-1.5 text-xs font-medium text-gray-700">Elegir en el mapa (clic)</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setMapPickTarget((prev) => (prev === 'origin' ? null : 'origin'))}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                mapPickTarget === 'origin'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Clic = origen
            </button>
            <button
              type="button"
              onClick={() => setMapPickTarget((prev) => (prev === 'destination' ? null : 'destination'))}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                mapPickTarget === 'destination'
                  ? 'bg-rose-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Clic = destino
            </button>
          </div>
          {mapPickTarget ? (
            <p className="mt-1.5 text-[11px] text-amber-700">
              {mapPickTarget === 'origin'
                ? 'Toca el mapa para fijar el origen.'
                : 'Toca el mapa para fijar el destino.'}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-gray-500">Activa una opcion y haz clic en el mapa.</p>
          )}
        </div>

        <input
          type="text"
          placeholder="Destino"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setShowDestinationSuggestions(true);
          }}
          onFocus={() => setShowDestinationSuggestions(true)}
          onBlur={() => {
            setTimeout(() => setShowDestinationSuggestions(false), 120);
          }}
          className="w-full p-2 border border-gray-300 rounded mb-2 text-sm"
        />
        {showDestinationSuggestions && (destinationSuggestions.length > 0 || isDestinationLoading) ? (
          <div className="w-full max-h-40 overflow-auto border border-gray-200 rounded mb-2 bg-white shadow-sm">
            {isDestinationLoading ? (
              <p className="text-xs text-gray-500 p-2">Buscando sugerencias...</p>
            ) : (
              destinationSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => {
                    setDestination(suggestion.placeName);
                    setShowDestinationSuggestions(false);
                  }}
                  className="w-full text-left px-2 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                >
                  {suggestion.placeName}
                </button>
              ))
            )}
          </div>
        ) : null}
        <button
          onClick={handleGetDirections}
          className="w-full bg-blue-600 text-white p-2 rounded text-sm hover:bg-blue-700 transition-colors"
        >
          Obtener Ruta
        </button>

        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="font-semibold text-sm mb-2">Direcciones guardadas</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Agregar direccion"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded text-sm"
            />
            <button
              onClick={handleAddAddress}
              className="bg-emerald-600 text-white px-3 rounded text-sm hover:bg-emerald-700 transition-colors"
            >
              Agregar
            </button>
          </div>

          <div className="max-h-32 overflow-auto space-y-1">
            {savedAddresses.length === 0 ? (
              <p className="text-xs text-gray-500">Aun no hay direcciones guardadas.</p>
            ) : (
              savedAddresses.map((address) => (
                <div key={address} className="flex items-center gap-2">
                  <p className="text-xs text-gray-700 flex-1 truncate">{address}</p>
                  <button
                    onClick={() => {
                      setOrigin(address);
                      setUseCurrentLocationAsOrigin(false);
                    }}
                    className="text-[11px] px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                  >
                    Origen
                  </button>
                  <button
                    onClick={() => setDestination(address)}
                    className="text-[11px] px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200"
                  >
                    Destino
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
