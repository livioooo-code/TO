let map;
let markers = [];
let routePolylines = [];
let trafficUpdateTimer;
let lastTrafficUpdateTime = 0;
let userLocationMarker = null;
let userLocation = null;
let isLocationTrackingEnabled = false;
let locationUpdateTimer = null;

function initMap() {
    // Initialize map
    map = L.map('map').setView([52.2297, 21.0122], 13); // Default view of Warsaw
    
    // Add the base tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Add geolocation functionality
    if (navigator.geolocation) {
        // Add control buttons for geolocation
        const locateControls = L.control({position: 'topright'});
        
        locateControls.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            div.innerHTML = `
                <a href="#" id="locate-once" title="Pokaż moją lokalizację" role="button" aria-label="Pokaż moją lokalizację" class="leaflet-control-locate">
                    <i class="fa fa-location-arrow" style="padding: 5px; display: block;"></i>
                </a>
                <a href="#" id="track-location" title="Śledź moją lokalizację" role="button" aria-label="Śledź moją lokalizację" class="leaflet-control-locate">
                    <i class="fa fa-crosshairs" style="padding: 5px; display: block;"></i>
                </a>
            `;
            
            // Single location button
            div.querySelector('#locate-once').onclick = function(e) {
                e.preventDefault();
                showCurrentLocation();
                return false;
            };
            
            // Continuous tracking button
            div.querySelector('#track-location').onclick = function(e) {
                e.preventDefault();
                toggleLocationTracking();
                return false;
            };
            
            return div;
        };
        
        locateControls.addTo(map);
        
        // Try to get location on page load if user already gave permission before
        setTimeout(function() {
            showCurrentLocation(false); // silent = true (no errors)
        }, 1000);
    }
    
    // Set up automatic traffic updates
    setupTrafficUpdates();
}

function setupTrafficUpdates() {
    // Check for traffic updates every 30 seconds
    trafficUpdateTimer = setInterval(checkTrafficUpdates, 30000);
    
    // Also attach event listener for page visibility
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            // Page is visible again, check for traffic updates if it's been more than 2 minutes
            const timeSinceLastUpdate = (Date.now() - lastTrafficUpdateTime) / 1000;
            if (timeSinceLastUpdate > 120) { // 2 minutes
                checkTrafficUpdates();
            }
        }
    });
    
    // Initial check
    setTimeout(checkTrafficUpdates, 5000); // Check after 5 seconds initially
}

function checkTrafficUpdates() {
    // Don't check too frequently
    const now = Date.now();
    if ((now - lastTrafficUpdateTime) / 1000 < 30) { // Minimum 30 seconds between checks
        return;
    }
    
    lastTrafficUpdateTime = now;
    
    // Make AJAX request to get updated route information
    fetch('/get_route?check_traffic=true')
        .then(response => response.json())
        .then(data => {
            if (data && data.has_traffic_update) {
                // Show notification about traffic update
                showTrafficUpdateNotification(data.traffic_update_reason);
                
                // Update the displayed route with new traffic information
                displayRoute(data);
            }
        })
        .catch(error => console.error('Error checking for traffic updates:', error));
}

function showTrafficUpdateNotification(reason) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'alert alert-warning alert-dismissible fade show';
    notification.innerHTML = `
        <i class="fas fa-traffic-light me-2"></i>
        <strong>Traffic Update:</strong> ${reason}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add to page
    document.querySelector('.container').prepend(notification);
    
    // Auto remove after 10 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 10000);
    
    // Play a notification sound
    playNotificationSound();
}

function playNotificationSound() {
    // Create and play a simple notification sound
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        console.log('Audio notification not supported');
    }
}

function displayRoute(routeData) {
    // Clear existing markers and polyline
    clearMap();
    
    if (!routeData || !routeData.coordinates || routeData.coordinates.length === 0) {
        console.error('No valid route data provided');
        return;
    }
    
    // Update the route_data hidden field for saving
    const routeDataField = document.getElementById('route_data');
    if (routeDataField) {
        routeDataField.value = JSON.stringify(routeData);
    }
    
    // Update route summary in the save form
    const routeStopsCountElement = document.getElementById('route-stops-count');
    const routeDistanceElement = document.getElementById('route-distance-summary');
    
    if (routeStopsCountElement && routeData.coordinates) {
        routeStopsCountElement.textContent = routeData.coordinates.length;
    }
    
    if (routeDistanceElement && routeData.route_details && routeData.route_details.total_distance) {
        routeDistanceElement.textContent = routeData.route_details.total_distance;
    }
    
    // Extract coordinates
    const coordinates = routeData.coordinates;
    
    // Create markers for each point
    coordinates.forEach((coord, index) => {
        // Skip the last point if it's the same as the first (return to start)
        if (index === coordinates.length - 1 && 
            coord[0] === coordinates[0][0] && 
            coord[1] === coordinates[0][1]) {
            return;
        }
        
        let markerIcon;
        let markerLabel = index === 0 ? 'Start' : `${index}`;
        
        // If we have location details, use them for better markers and popups
        if (routeData.location_details && routeData.location_details[index]) {
            const locationDetail = routeData.location_details[index];
            const category = locationDetail.category || 'home';
            
            // Create marker icon with number
            markerIcon = L.divIcon({
                className: 'map-marker',
                html: `<div class="marker-container">
                        <i class="${getCategoryIcon(category)}"></i>
                        <span class="marker-number">${index + 1}</span>
                      </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            
            // Create popup content with estimated arrival time if available
            let popupContent = `
                <div class="location-popup">
                    <h6>${index + 1}. ${locationDetail.street} ${locationDetail.number}</h6>
                    <div>${locationDetail.city}</div>
                    <div class="location-category ${category}">${getCategoryName(category)}</div>
            `;
            
            // Add estimated arrival time if available
            if (locationDetail.estimated_arrival) {
                popupContent += `
                    <div class="mt-2">
                        <i class="fas fa-clock me-1"></i> Estimated arrival: <strong>${locationDetail.estimated_arrival}</strong>
                    </div>
                `;
            }
            
            // Add time window if available
            if (locationDetail.time_window_start && locationDetail.time_window_end) {
                popupContent += `
                    <div class="time-window">
                        <i class="fas fa-hourglass-half me-1"></i>
                        Window: ${locationDetail.time_window_start} - ${locationDetail.time_window_end}
                    </div>
                `;
            }
            
            popupContent += `</div>`;
            
            // Add a marker
            const marker = L.marker([coord[1], coord[0]], {
                icon: markerIcon,
                title: `Stop ${index + 1}`
            }).addTo(map).bindPopup(popupContent);
            
            markers.push(marker);
        } else if (routeData.addresses && routeData.addresses[index]) {
            // Simplified version when we only have addresses
            const address = routeData.addresses[index];
            
            // Default icon with number
            markerIcon = L.divIcon({
                className: 'map-marker',
                html: `<div class="marker-container">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="marker-number">${index + 1}</span>
                      </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            
            // Create popup content
            let popupContent = `
                <div class="location-popup">
                    <div>${address}</div>
                </div>
            `;
            
            // Add a marker
            const marker = L.marker([coord[1], coord[0]], {
                icon: markerIcon,
                title: `Stop ${index + 1}`
            }).addTo(map).bindPopup(popupContent);
            
            markers.push(marker);
        } else {
            // Fallback when we don't have any additional information
            markerIcon = L.divIcon({
                className: 'map-marker',
                html: `<div class="marker-container">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="marker-number">${index + 1}</span>
                      </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            
            const marker = L.marker([coord[1], coord[0]], {
                icon: markerIcon,
                title: `Stop ${index + 1}`
            }).addTo(map);
            
            markers.push(marker);
        }
    });
    
    // Create polylines for the route segments with traffic colors if available
    // Sprawdzamy, czy mamy segmenty na głównym poziomie obiektu trasy (nowa struktura)
    let segments = routeData.segments;
    
    // Jeśli nie, sprawdzamy czy są w route_details (stara struktura)
    if (!segments && routeData.route_details && routeData.route_details.segments) {
        segments = routeData.route_details.segments;
    }
    
    // Dodajmy więcej informacji o segmentach
    console.log("Wszystkie dane trasy:", routeData);
    
    // Jeśli znaleziono segmenty, rysujemy je z kolorami zależnymi od ruchu
    if (segments && segments.length > 0) {
        console.log("Rysowanie segmentów z kolorami ruchu:", segments);
        
        // Draw each segment separately with its traffic color
        for (const segment of segments) {
            // Get route data for this segment
            let segmentPoints = [];
            
            if (segment.geometry && Array.isArray(segment.geometry)) {
                console.log(`Segment [${segment.start_idx}-${segment.end_idx}] geometria:`, segment.geometry);
                
                // Sprawdzamy, czy mamy pełną geometrię (wszystkie punkty pośrednie)
                if (segment.geometry.length > 2) {
                    console.log(`Segment ma ${segment.geometry.length} punktów geometrycznych - rysujemy precyzyjną trasę`, segment.geometry);
                    // Konwertujemy wszystkie punkty z [lon, lat] na [lat, lon]
                    segmentPoints = segment.geometry.map(coord => {
                        console.log("Przetwarzanie punktu geometrii:", coord);
                        return [coord[1], coord[0]];
                    });
                    console.log("Punkty po konwersji:", segmentPoints);
                } else {
                    console.log("Segment ma tylko początki i koniec - linia prosta");
                    // Tylko punkty początkowy i końcowy - linia prosta
                    segmentPoints = segment.geometry.map(coord => [coord[1], coord[0]]);
                }
            } else {
                console.error("Brak danych geometrycznych dla segmentu");
                return;
            }
            
            // Determine color based on traffic level
            let segmentColor = '#0d6efd'; // Default blue
            let weight = 5;
            
            if (segment.traffic_color) {
                switch (segment.traffic_color) {
                    case 'green':
                        segmentColor = '#198754'; // Free flowing
                        break;
                    case 'yellow':
                        segmentColor = '#ffc107'; // Light traffic
                        break;
                    case 'orange':
                        segmentColor = '#fd7e14'; // Moderate traffic
                        break;
                    case 'red':
                        segmentColor = '#dc3545'; // Heavy traffic
                        weight = 6; // Make red segments thicker
                        break;
                }
            }
            
            // Create polyline for this segment
            const segmentPolyline = L.polyline(segmentPoints, {
                color: segmentColor,
                weight: weight,
                opacity: 0.8
            }).addTo(map);
            
            // Add popup with traffic information
            if (segment.traffic_level !== undefined) {
                let trafficStatus = 'Unknown';
                let delayText = '';
                
                // Determine traffic status text
                switch (segment.traffic_level) {
                    case 0:
                        trafficStatus = 'Free flowing traffic';
                        break;
                    case 1:
                        trafficStatus = 'Light traffic';
                        break;
                    case 2:
                        trafficStatus = 'Moderate traffic';
                        break;
                    case 3:
                        trafficStatus = 'Heavy traffic';
                        break;
                }
                
                // Add delay information if there is any
                if (segment.traffic_delay > 0) {
                    const delayMinutes = Math.round(segment.traffic_delay / 60);
                    delayText = `<div class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i>+${delayMinutes} min delay</div>`;
                }
                
                segmentPolyline.bindPopup(`
                    <div>
                        <strong>${trafficStatus}</strong>
                        ${delayText}
                    </div>
                `);
            }
            
            routePolylines.push(segmentPolyline);
        }
    } else {
        // Fallback to simple route drawing if no segments with traffic info
        const routePoints = coordinates.map(coord => [coord[1], coord[0]]);
        const routePolyline = L.polyline(routePoints, {
            color: '#0d6efd',
            weight: 5,
            opacity: 0.7
        }).addTo(map);
        
        routePolylines.push(routePolyline);
    }
    
    // Fit the map bounds to show all markers
    if (routePolylines.length > 0) {
        // Create a feature group with all polylines
        const featureGroup = L.featureGroup(routePolylines);
        map.fitBounds(featureGroup.getBounds(), {
            padding: [50, 50]
        });
    }
    
    // Show route summary
    updateRouteSummary(routeData);
    
    // Show the navigation button and export options
    document.getElementById('start-navigation-btn').classList.remove('d-none');
    document.getElementById('export-options').classList.remove('d-none');
    
    // Store route data in session storage for the navigation button
    sessionStorage.setItem('routeData', JSON.stringify(routeData));
    
    // Pokaż przyciski nawigacyjne
    document.getElementById('start-navigation-btn').classList.remove('d-none');
    document.getElementById('add-all-points-btn').classList.remove('d-none');
}

// Funkcja aktualizacji lokalizacji użytkownika
function showCurrentLocation(showError = true) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                // Zapisz lokalizację użytkownika
                userLocation = [lat, lon];
                
                // Przesuń mapę do lokalizacji użytkownika
                map.setView([lat, lon], 15);
                
                // Usuń istniejący marker i dodaj nowy
                if (userLocationMarker) {
                    map.removeLayer(userLocationMarker);
                }
                
                // Stwórz marker z animacją pulsowania
                userLocationMarker = L.marker([lat, lon], {
                    icon: L.divIcon({
                        className: 'current-location-marker pulsing',
                        html: '<div class="pulse"></div><i class="fas fa-street-view" style="color: #007bff; font-size: 24px;"></i>',
                        iconSize: [30, 30],
                        iconAnchor: [15, 30]
                    })
                }).addTo(map);
                
                userLocationMarker.bindPopup("Twoja obecna lokalizacja").openPopup();
                
                // Jeśli mamy dane trasy, pokaż przycisk nawigacji do pierwszego punktu
                const routeData = JSON.parse(sessionStorage.getItem('routeData') || '{}');
                if (routeData && routeData.coordinates && routeData.coordinates.length > 0) {
                    // Pokaż przycisk nawigacji
                    document.getElementById('start-navigation-btn').classList.remove('d-none');
                    
                    // Zaaktualizuj etykiety z odległością
                    updateDistanceLabels();
                }
            },
            error => {
                if (showError) {
                    console.error("Geolocation error:", error);
                    alert("Nie można uzyskać Twojej lokalizacji. Sprawdź uprawnienia lokalizacji w ustawieniach przeglądarki.");
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else if (showError) {
        alert('Geolokalizacja nie jest obsługiwana przez Twoją przeglądarkę.');
    }
}

// Włącz/wyłącz śledzenie lokalizacji
function toggleLocationTracking() {
    if (isLocationTrackingEnabled) {
        // Wyłącz śledzenie
        stopLocationTracking();
    } else {
        // Włącz śledzenie
        startLocationTracking();
    }
}

// Rozpocznij śledzenie lokalizacji użytkownika
function startLocationTracking() {
    if (locationUpdateTimer) {
        clearInterval(locationUpdateTimer);
    }
    
    // Ustaw flagę śledzenia
    isLocationTrackingEnabled = true;
    
    // Dodaj klasę do przycisku śledzenia
    const trackButton = document.getElementById('track-location');
    if (trackButton) {
        trackButton.classList.add('active');
        trackButton.querySelector('i').classList.add('text-primary');
    }
    
    // Pokaż powiadomienie
    const notification = document.createElement('div');
    notification.className = 'alert alert-info alert-dismissible fade show';
    notification.id = 'tracking-notification';
    notification.innerHTML = `
        <i class="fas fa-location-arrow me-2"></i>
        <strong>Śledzenie lokalizacji włączone</strong>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" 
                onclick="stopLocationTracking()"></button>
    `;
    document.querySelector('.container').prepend(notification);
    
    // Pobierz aktualną lokalizację natychmiast
    showCurrentLocation();
    
    // Okresowo aktualizuj lokalizację
    locationUpdateTimer = setInterval(function() {
        showCurrentLocation(false); // silent = true (no errors)
        updateDistanceLabels();
    }, 10000); // co 10 sekund
}

// Zatrzymaj śledzenie lokalizacji
function stopLocationTracking() {
    // Wyczyść timer
    if (locationUpdateTimer) {
        clearInterval(locationUpdateTimer);
        locationUpdateTimer = null;
    }
    
    // Zresetuj flagę
    isLocationTrackingEnabled = false;
    
    // Usuń klasę z przycisku
    const trackButton = document.getElementById('track-location');
    if (trackButton) {
        trackButton.classList.remove('active');
        trackButton.querySelector('i').classList.remove('text-primary');
    }
    
    // Usuń powiadomienie, jeśli istnieje
    const notification = document.getElementById('tracking-notification');
    if (notification) {
        notification.remove();
    }
}

// Aktualizuj etykiety z odległością do punktów trasy
function updateDistanceLabels() {
    if (!userLocation) return;
    
    const routeData = JSON.parse(sessionStorage.getItem('routeData') || '{}');
    if (!routeData || !routeData.coordinates || routeData.coordinates.length === 0) return;
    
    // Dla każdego punktu trasy, oblicz odległość od aktualnej lokalizacji użytkownika
    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const coord = routeData.coordinates[i];
        
        if (!coord) continue;
        
        // Oblicz odległość w linii prostej
        const latLng = marker.getLatLng();
        const distance = calculateHaversineDistance(
            userLocation[0], userLocation[1],
            latLng.lat, latLng.lng
        );
        
        // Zaktualizuj popup markera
        if (marker && marker._popup) {
            const content = marker._popup.getContent();
            
            // Usuń poprzednią odległość, jeśli istnieje
            let newContent = content.replace(/<div class="distance-label">.*?<\/div>/g, '');
            
            // Dodaj nową odległość
            newContent = newContent.replace('</div>', 
                `<div class="distance-label mt-2">
                    <i class="fas fa-ruler me-1"></i> Odległość: <strong>${distance.toFixed(1)} km</strong>
                </div></div>`);
                
            marker._popup.setContent(newContent);
            
            // Jeśli popup jest otwarty, zaktualizuj go
            if (marker._popup.isOpen()) {
                marker._popup.update();
            }
        }
    }
}

// Funkcja obliczająca odległość między dwoma punktami (haversine formula)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

function startNavigation() {
    // Pokaż elementy nawigacyjne
    document.getElementById('navigation-panel').classList.remove('d-none');
    
    // Użyj zapisanej lokalizacji lub pobierz aktualną
    if (userLocation) {
        console.log("Używam już zapisanej lokalizacji użytkownika:", userLocation);
        navigateToFirstStop(userLocation);
    } else {
        console.log("Pobieram lokalizację użytkownika...");
        // Pobierz lokalizację użytkownika
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                console.log("Pobrano lokalizację:", lat, lon);
                
                // Zapisz lokalizację
                userLocation = [lat, lon];
                
                // Nawiguj do pierwszego punktu
                navigateToFirstStop(userLocation);
            }, error => {
                console.error('Błąd geolokalizacji:', error);
                alert('Nie można uzyskać Twojej lokalizacji. Włącz usługi lokalizacyjne i spróbuj ponownie.');
            }, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        } else {
            alert('Geolokalizacja nie jest obsługiwana przez Twoją przeglądarkę.');
        }
    }
}

// Funkcja nawigowania do pierwszego punktu trasy
function navigateToFirstStop(currentLocation) {
    // Pobierz dane trasy
    const routeData = JSON.parse(sessionStorage.getItem('routeData') || '{}');
    if (!routeData || !routeData.coordinates || routeData.coordinates.length === 0) {
        console.error('Brak prawidłowych danych trasy');
        return;
    }
    
    // Pobierz współrzędne pierwszego punktu (konwertuj z [lon,lat] na [lat,lon])
    const firstStop = [routeData.coordinates[0][1], routeData.coordinates[0][0]];
    
    // Upewnij się, że currentLocation jest tablicą [lat, lon]
    let originCoords;
    if (Array.isArray(currentLocation)) {
        originCoords = currentLocation.join(',');
    } else {
        console.error('Nieprawidłowy format aktualnej lokalizacji:', currentLocation);
        return;
    }
    
    // Otwórz Google Maps z trasą
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originCoords}&destination=${firstStop.join(',')}&travelmode=driving`;
    window.open(googleMapsUrl, '_blank');
    
    // Zapisz punkt jako aktualny cel
    sessionStorage.setItem('currentDestination', JSON.stringify({
        index: 0,
        coordinates: firstStop
    }));
    
    // Pokaż powiadomienie
    const notification = document.createElement('div');
    notification.className = 'alert alert-success alert-dismissible fade show';
    notification.innerHTML = `
        <i class="fas fa-directions me-2"></i>
        <strong>Nawigacja rozpoczęta!</strong> Otwarto Google Maps z trasą do pierwszego punktu.
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.container').prepend(notification);
    
    // Auto-zamknij po 5 sekundach
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
    
    // Rozpocznij monitorowanie bieżącej lokalizacji, aby automatycznie przejść do następnego punktu
    startDestinationMonitoring();
}

// Dodaj wszystkie punkty do Google Maps jednocześnie
function addAllPointsToGoogleMaps() {
    // Pobierz dane trasy
    const routeData = JSON.parse(sessionStorage.getItem('routeData') || '{}');
    if (!routeData || !routeData.coordinates || routeData.coordinates.length < 2) {
        alert('Brak danych trasy do wyeksportowania.');
        return;
    }
    
    // Przygotuj punkty w formacie Google Maps
    const waypoints = [];
    
    // Jeśli mamy więcej niż 2 punkty, to wszystkie punkty pomiędzy są waypointami
    if (routeData.coordinates.length > 2) {
        for (let i = 1; i < routeData.coordinates.length - 1; i++) {
            // Konwertuj z [lon,lat] na [lat,lon] dla Google Maps
            waypoints.push(`${routeData.coordinates[i][1]},${routeData.coordinates[i][0]}`);
        }
    }
    
    // Pierwszy punkt jako początek
    const origin = `${routeData.coordinates[0][1]},${routeData.coordinates[0][0]}`;
    
    // Ostatni punkt jako cel
    const destination = `${routeData.coordinates[routeData.coordinates.length-1][1]},${routeData.coordinates[routeData.coordinates.length-1][0]}`;
    
    // Połącz waypoints z separatorem '|'
    const waypointsString = waypoints.join('|');
    
    // Stwórz URL Google Maps
    let googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    
    // Dodaj waypoints, jeśli istnieją
    if (waypoints.length > 0) {
        googleMapsUrl += `&waypoints=${waypointsString}`;
    }
    
    // Otwórz URL w nowej karcie
    window.open(googleMapsUrl, '_blank');
    
    // Pokaż powiadomienie
    const notification = document.createElement('div');
    notification.className = 'alert alert-info alert-dismissible fade show';
    notification.innerHTML = `
        <i class="fas fa-external-link-alt me-2"></i>
        <strong>Otwarto trasę w Google Maps!</strong>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.container').prepend(notification);
    
    // Auto-zamknij po 5 sekundach
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}

// Funkcje związane z automatycznym przechodzeniem do kolejnych punktów
let destinationMonitoringActive = false;
let destinationMonitoringTimer = null;
const ARRIVAL_THRESHOLD = 0.05; // 50 metrów jako próg dotarcia do celu

// Rozpocznij monitorowanie lokalizacji w celu wykrycia dotarcia do punktu docelowego
function startDestinationMonitoring() {
    if (destinationMonitoringActive) return;
    
    destinationMonitoringActive = true;
    
    // Pokaż powiadomienie
    const notification = document.createElement('div');
    notification.className = 'alert alert-info alert-dismissible fade show';
    notification.id = 'destination-monitoring-notification';
    notification.innerHTML = `
        <i class="fas fa-crosshairs me-2"></i>
        <strong>Automatyczne monitorowanie trasy włączone</strong> 
        <span class="small">System automatycznie wykryje Twoje przybycie do punktu i przełączy na następny.</span>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" 
                onclick="stopDestinationMonitoring()"></button>
    `;
    document.querySelector('.container').prepend(notification);
    
    // Rozpocznij monitorowanie lokalizacji
    if (!isLocationTrackingEnabled) {
        startLocationTracking();
    }
    
    // Regularnie sprawdzaj, czy dotarliśmy do punktu docelowego
    destinationMonitoringTimer = setInterval(checkArrivalAtDestination, 10000); // Co 10 sekund
}

// Zatrzymaj monitorowanie dotarcia do punktu docelowego
function stopDestinationMonitoring() {
    if (!destinationMonitoringActive) return;
    
    destinationMonitoringActive = false;
    
    // Wyczyść timer
    if (destinationMonitoringTimer) {
        clearInterval(destinationMonitoringTimer);
        destinationMonitoringTimer = null;
    }
    
    // Usuń powiadomienie
    const notification = document.getElementById('destination-monitoring-notification');
    if (notification) {
        notification.remove();
    }
}

// Sprawdź, czy dotarliśmy do bieżącego punktu docelowego
function checkArrivalAtDestination() {
    // Sprawdź, czy mamy aktualną lokalizację
    if (!userLocation) return;
    
    // Pobierz bieżący cel z session storage
    const currentDestinationData = JSON.parse(sessionStorage.getItem('currentDestination') || '{}');
    if (!currentDestinationData || !currentDestinationData.coordinates) return;
    
    // Sprawdź odległość do celu
    const distance = calculateHaversineDistance(
        userLocation[0], userLocation[1],
        currentDestinationData.coordinates[0], currentDestinationData.coordinates[1]
    );
    
    console.log(`Odległość do punktu docelowego: ${distance.toFixed(3)} km`);
    
    // Jeśli jesteśmy wystarczająco blisko punktu docelowego, przejdź do następnego
    if (distance <= ARRIVAL_THRESHOLD) {
        // Pokazujemy powiadomienie o przybyciu
        showArrivalNotification(currentDestinationData.index);
        
        // Przejdź do następnego punktu
        navigateToNextPoint(currentDestinationData.index + 1);
    }
}

// Pokaż powiadomienie o dotarciu do punktu
function showArrivalNotification(pointIndex) {
    // Pobierz dane trasy
    const routeData = JSON.parse(sessionStorage.getItem('routeData') || '{}');
    if (!routeData || !routeData.coordinates) return;
    
    // Pobierz dane lokalizacji, jeśli dostępne
    let locationName = `Punkt ${pointIndex + 1}`;
    let locationAddress = "";
    
    if (routeData.location_details && routeData.location_details[pointIndex]) {
        const location = routeData.location_details[pointIndex];
        locationName = `${location.street} ${location.number}`;
        locationAddress = location.formatted_address || `${location.city}`;
    } else if (routeData.addresses && routeData.addresses[pointIndex]) {
        locationAddress = routeData.addresses[pointIndex];
    }
    
    // Stwórz powiadomienie
    const notification = document.createElement('div');
    notification.className = 'alert alert-success alert-dismissible fade show';
    notification.innerHTML = `
        <i class="fas fa-flag-checkered me-2"></i>
        <strong>Dotarłeś do celu!</strong>
        <div>${locationName}</div>
        <div class="small text-muted">${locationAddress}</div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.container').prepend(notification);
    
    // Auto-zamknij po 8 sekundach
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 8000);
    
    // Zagraj dźwięk powiadomienia
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.25); // E5
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.5); // G5
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.4);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.8);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.8);
    } catch (e) {
        console.log('Audio notification not supported');
    }
    
    // Oznacz ten punkt jako ukończony na mapie
    if (markers[pointIndex]) {
        markers[pointIndex].setIcon(L.divIcon({
            className: 'map-marker completed',
            html: `<i class="fas fa-check"></i>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        }));
    }
}

// Przejdź do nawigacji do następnego punktu
function navigateToNextPoint(nextIndex) {
    // Pobierz dane trasy
    const routeData = JSON.parse(sessionStorage.getItem('routeData') || '{}');
    if (!routeData || !routeData.coordinates || !routeData.coordinates.length) return;
    
    // Sprawdź, czy istnieje następny punkt
    if (nextIndex >= routeData.coordinates.length || 
        // Pomiń ostatni punkt, jeśli to powrót do początku
        (nextIndex === routeData.coordinates.length - 1 && 
         routeData.coordinates[nextIndex][0] === routeData.coordinates[0][0] && 
         routeData.coordinates[nextIndex][1] === routeData.coordinates[0][1])) {
        
        // To był ostatni punkt, zakończ nawigację
        completeRoute();
        return;
    }
    
    // Pobierz współrzędne następnego punktu (konwertuj z [lon,lat] na [lat,lon])
    const nextStop = [routeData.coordinates[nextIndex][1], routeData.coordinates[nextIndex][0]];
    
    // Zapisz jako bieżący cel
    sessionStorage.setItem('currentDestination', JSON.stringify({
        index: nextIndex,
        coordinates: nextStop
    }));
    
    // Pobierz aktualną lokalizację i rozpocznij nawigację
    if (userLocation) {
        // Otwórz Google Maps z trasą
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.join(',')}&destination=${nextStop.join(',')}&travelmode=driving`;
        window.open(googleMapsUrl, '_blank');
        
        // Pokaż powiadomienie
        const notification = document.createElement('div');
        notification.className = 'alert alert-primary alert-dismissible fade show';
        notification.innerHTML = `
            <i class="fas fa-directions me-2"></i>
            <strong>Nawigacja do następnego punktu!</strong> Otwarto Google Maps z trasą.
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        document.querySelector('.container').prepend(notification);
        
        // Auto-zamknij po 5 sekundach
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }
}

// Zakończ całą trasę
function completeRoute() {
    stopDestinationMonitoring();
    
    // Pokaż powiadomienie o zakończeniu trasy
    const notification = document.createElement('div');
    notification.className = 'alert alert-success alert-dismissible fade show';
    notification.innerHTML = `
        <i class="fas fa-trophy me-2"></i>
        <strong>Trasa ukończona!</strong> Dotarłeś do wszystkich punktów na trasie.
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.container').prepend(notification);
    
    // Zagraj dźwięk ukończenia trasy
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.3); // E5
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.6); // G5
        oscillator.frequency.setValueAtTime(1046.50, audioContext.currentTime + 0.9); // C6
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.8);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime + 1.2);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1.2);
    } catch (e) {
        console.log('Audio notification not supported');
    }
}

// Dodaj wszystkie punkty trasy do Google Maps
function addAllPointsToGoogleMaps() {
    // Pobierz dane trasy
    const routeData = JSON.parse(sessionStorage.getItem('routeData') || '{}');
    if (!routeData || !routeData.coordinates || routeData.coordinates.length < 2) {
        alert('Brak prawidłowych danych trasy');
        return;
    }
    
    // Przygotuj zapytanie do Google Maps
    let waypoints = '';
    const points = routeData.coordinates;
    
    // Pierwszy punkt to początek
    const origin = `${points[0][1]},${points[0][0]}`;
    
    // Ostatni punkt to cel
    const destination = `${points[points.length-1][1]},${points[points.length-1][0]}`;
    
    // Wszystkie punkty pośrednie jako waypoints
    for (let i = 1; i < points.length - 1; i++) {
        waypoints += `${points[i][1]},${points[i][0]}|`;
    }
    waypoints = waypoints.slice(0, -1); // Usuń ostatni separator
    
    // Stwórz URL do Google Maps
    let googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    
    // Dodaj punkty pośrednie, jeśli istnieją
    if (waypoints) {
        googleMapsUrl += `&waypoints=${waypoints}`;
    }
    
    // Otwórz Google Maps w nowej karcie
    window.open(googleMapsUrl, '_blank');
    
    // Pokaż powiadomienie
    const notification = document.createElement('div');
    notification.className = 'alert alert-info alert-dismissible fade show';
    notification.innerHTML = `
        <i class="fas fa-map-marked-alt me-2"></i>
        <strong>Trasa dodana do Google Maps!</strong> Wszystkie punkty zostały dodane do nawigacji.
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.container').prepend(notification);
    
    // Auto-zamknij po 5 sekundach
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}

function clearMap() {
    // Remove existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Remove existing polylines
    routePolylines.forEach(polyline => map.removeLayer(polyline));
    routePolylines = [];
    
    // Hide route summary
    document.getElementById('route-summary').classList.add('d-none');
    
    // Hide navigation button and export options
    document.getElementById('start-navigation-btn').classList.add('d-none');
    document.getElementById('export-options').classList.add('d-none');
    
    // Wyczyść dane monitorowania
    stopDestinationMonitoring();
}

function updateRouteSummary(routeData) {
    const summaryElement = document.getElementById('route-summary');
    if (!summaryElement) return;
    
    if (!routeData) {
        summaryElement.classList.add('d-none');
        return;
    }
    
    // Prepare traffic delay information if available
    let trafficDelayHtml = '';
    if (routeData.traffic_delay_text && routeData.has_traffic_data) {
        const delayClass = routeData.traffic_delay_text.includes("No delays") ? "text-success" : "text-danger";
        trafficDelayHtml = `
            <div class="mt-2 ${delayClass}">
                <i class="fas fa-car me-1"></i> ${routeData.traffic_delay_text}
            </div>
        `;
    }
    
    // Create traffic status indicator
    let trafficStatusHtml = '';
    if (routeData.traffic_conditions && routeData.traffic_conditions.length > 0) {
        // Count traffic levels
        const trafficCounts = {0: 0, 1: 0, 2: 0, 3: 0};
        let totalSegments = 0;
        
        routeData.traffic_conditions.forEach(condition => {
            if (condition.level !== undefined) {
                trafficCounts[condition.level]++;
                totalSegments++;
            }
        });
        
        // Create traffic status badges
        trafficStatusHtml = '<div class="d-flex gap-2 mt-2">';
        
        if (trafficCounts[0] > 0) {
            const percent = Math.round((trafficCounts[0] / totalSegments) * 100);
            trafficStatusHtml += `<span class="badge bg-success">${percent}% Free flowing</span>`;
        }
        
        if (trafficCounts[1] > 0) {
            const percent = Math.round((trafficCounts[1] / totalSegments) * 100);
            trafficStatusHtml += `<span class="badge bg-warning text-dark">${percent}% Light traffic</span>`;
        }
        
        if (trafficCounts[2] > 0) {
            const percent = Math.round((trafficCounts[2] / totalSegments) * 100);
            trafficStatusHtml += `<span class="badge" style="background-color: #fd7e14;">${percent}% Moderate</span>`;
        }
        
        if (trafficCounts[3] > 0) {
            const percent = Math.round((trafficCounts[3] / totalSegments) * 100);
            trafficStatusHtml += `<span class="badge bg-danger">${percent}% Heavy traffic</span>`;
        }
        
        trafficStatusHtml += '</div>';
    }
    
    // Create summary content
    let content = `
        <div class="card mb-4">
            <div class="card-header bg-success text-white">
                <h5 class="mb-0"><i class="fas fa-route me-2"></i>Optimized Route</h5>
            </div>
            <div class="card-body">
                <div class="row mb-3">
                    <div class="col-6">
                        <div class="d-flex align-items-center">
                            <div class="fs-1 me-2 text-primary">
                                <i class="fas fa-road"></i>
                            </div>
                            <div>
                                <div class="fs-4">${routeData.total_distance} km</div>
                                <div class="text-muted">Total Distance</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="d-flex align-items-center">
                            <div class="fs-1 me-2 text-info">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div>
                                <div class="fs-4">${routeData.total_time}</div>
                                <div class="text-muted">Estimated Time</div>
                                ${trafficDelayHtml}
                            </div>
                        </div>
                    </div>
                </div>
                
                ${trafficStatusHtml}
                
                <h6 class="mt-3"><i class="fas fa-list-ol me-2"></i>Route Order:</h6>
                <ol class="list-group list-group-numbered">
    `;
    
    // Add each stop to the list
    const addresses = routeData.addresses || [];
    addresses.forEach((address, index) => {
        // Skip the last point if it's returning to start
        if (index === addresses.length - 1 && 
            index > 0 && 
            address === addresses[0]) {
            return;
        }
        
        // Check if we have detailed location information
        let category = 'home';
        let badge = '';
        let estimatedArrival = '';
        
        if (routeData.location_details && routeData.location_details[index]) {
            const locationDetail = routeData.location_details[index];
            category = locationDetail.category || 'home';
            
            // Add time window if available
            const timeStart = locationDetail.time_window_start;
            const timeEnd = locationDetail.time_window_end;
            
            if (timeStart && timeEnd) {
                badge = `<span class="badge bg-secondary ms-2">
                    <i class="far fa-clock me-1"></i>${timeStart} - ${timeEnd}
                </span>`;
            }
            
            // Add estimated arrival if available
            if (locationDetail.estimated_arrival) {
                estimatedArrival = `
                    <div class="small text-info mt-1">
                        <i class="fas fa-clock me-1"></i>ETA: ${locationDetail.estimated_arrival}
                    </div>
                `;
            }
        }
        
        // Add to list
        content += `
            <li class="list-group-item d-flex justify-content-between align-items-start">
                <div class="ms-2 me-auto">
                    <div>
                        <span class="location-category ${category}">${getCategoryName(category)}</span>
                        ${badge}
                    </div>
                    <div class="text-muted">${address}</div>
                    ${estimatedArrival}
                </div>
            </li>
        `;
    });
    
    content += `
                </ol>
                
                <div class="mt-3 d-flex justify-content-end">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="checkTrafficUpdates()">
                        <i class="fas fa-sync-alt me-1"></i>Check for Traffic Updates
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Update the summary element
    summaryElement.innerHTML = content;
    summaryElement.classList.remove('d-none');
    
    // Show save route form
    document.getElementById('save-route-form').classList.remove('d-none');
}

function getCategoryIcon(category) {
    let iconClass;
    let colorClass;
    
    switch (category) {
        case 'home':
            iconClass = 'fa-home';
            colorClass = 'home';
            break;
        case 'office':
            iconClass = 'fa-building';
            colorClass = 'office';
            break;
        case 'business':
            iconClass = 'fa-briefcase';
            colorClass = 'business';
            break;
        case 'pickup_point':
            iconClass = 'fa-box';
            colorClass = 'pickup_point';
            break;
        default:
            iconClass = 'fa-map-marker-alt';
            colorClass = 'other';
    }
    
    return L.divIcon({
        className: `map-marker ${colorClass}`,
        html: `<i class="fas ${iconClass}"></i>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

function getCategoryName(category) {
    switch (category) {
        case 'home':
            return 'Home';
        case 'office':
            return 'Office';
        case 'business':
            return 'Business';
        case 'pickup_point':
            return 'Pickup Point';
        default:
            return 'Other';
    }
}
