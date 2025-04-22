// JavaScript dla obsługi formularza
document.addEventListener('DOMContentLoaded', function() {
    // Obsługa dodawania nowej lokalizacji
    function addLocationEntry() {
        // Pobierz liczbę istniejących lokalizacji
        const locationCount = parseInt(document.getElementById('location_count').value);
        const newIdx = locationCount;
        
        // Zwiększ liczbę lokalizacji
        document.getElementById('location_count').value = locationCount + 1;
        
        // Stwórz nowy element lokalizacji
        const locationEntry = document.createElement('div');
        locationEntry.className = 'location-entry mb-3';
        locationEntry.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>Location ${newIdx + 1}</strong>
                <div>
                    <span class="badge bg-primary">${newIdx + 1}</span>
                    <button type="button" class="btn btn-sm btn-outline-danger ms-2" onclick="removeLocation(this.parentNode.parentNode.parentNode)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="mb-2">
                <label for="city_${newIdx}" class="form-label">City:</label>
                <input type="text" class="form-control" id="city_${newIdx}" name="city_${newIdx}" required>
            </div>
            <div class="mb-2">
                <label for="street_${newIdx}" class="form-label">Street:</label>
                <input type="text" class="form-control" id="street_${newIdx}" name="street_${newIdx}" required>
            </div>
            <div class="mb-2">
                <label for="number_${newIdx}" class="form-label">Building Number:</label>
                <input type="text" class="form-control" id="number_${newIdx}" name="number_${newIdx}" required>
            </div>
            <div class="category-row mb-2 d-none d-md-block">
                <label for="category_${newIdx}" class="form-label">Category:</label>
                <select class="form-select" id="category_${newIdx}" name="category_${newIdx}">
                    <option value="home">Home</option>
                    <option value="office">Office</option>
                    <option value="business">Business</option>
                    <option value="pickup_point">Pickup Point</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div class="time-window-row mb-2 d-none d-md-block">
                <div class="row">
                    <div class="col-6">
                        <label for="time_window_start_${newIdx}" class="form-label">From:</label>
                        <input type="time" class="form-control" id="time_window_start_${newIdx}" name="time_window_start_${newIdx}">
                    </div>
                    <div class="col-6">
                        <label for="time_window_end_${newIdx}" class="form-label">To:</label>
                        <input type="time" class="form-control" id="time_window_end_${newIdx}" name="time_window_end_${newIdx}">
                    </div>
                </div>
            </div>
        `;
        
        // Dodaj nowy element lokalizacji do kontenera
        document.getElementById('locations-container').appendChild(locationEntry);
    }
    
    // Usuń lokalizację
    function removeLocation(locationElement) {
        // Upewnij się, że zawsze jest co najmniej jedna lokalizacja
        const locationsCount = document.querySelectorAll('.location-entry').length;
        if (locationsCount <= 1) {
            alert('You need at least one location.');
            return;
        }
        
        // Usuń element z DOM
        locationElement.remove();
        
        // Zaktualizuj licznik
        document.getElementById('location_count').value = locationsCount - 1;
        
        // Zaktualizuj numerację pozostałych lokalizacji
        document.querySelectorAll('.location-entry').forEach((entry, idx) => {
            // Zaktualizuj nagłówek
            const header = entry.querySelector('strong');
            if (header) {
                header.textContent = idx === 0 ? 'Starting Point' : `Location ${idx + 1}`;
            }
            
            // Zaktualizuj numer
            const badge = entry.querySelector('.badge');
            if (badge) {
                badge.textContent = idx + 1;
            }
        });
    }
    
    // Funkcja przełączająca tryb aktualnej lokalizacji
    function toggleCurrentLocationMode() {
        const useCurrentLocationCheckbox = document.getElementById('use_current_location');
        const isChecked = useCurrentLocationCheckbox.checked;
        const firstLocationInputs = document.querySelector('.location-entry:first-child');
        
        if (isChecked) {
            // Pobierz aktualną lokalizację użytkownika
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        // Zapisz współrzędne w ukrytych polach formularza
                        document.getElementById('current_lat').value = position.coords.latitude;
                        document.getElementById('current_lon').value = position.coords.longitude;
                        
                        // Wyświetl powiadomienie o sukcesie
                        const alertContainer = document.createElement('div');
                        alertContainer.className = 'alert alert-success alert-dismissible fade show mt-2';
                        alertContainer.innerHTML = `
                            <i class="fas fa-check-circle me-2"></i>Lokalizacja pobrana pomyślnie.
                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                        `;
                        document.querySelector('.form-check-input').closest('.mb-3').appendChild(alertContainer);
                        
                        // Oznacz pierwszy punkt jako opcjonalny
                        const firstLocationInputs = document.querySelectorAll('.location-entry:first-child input[required]');
                        firstLocationInputs.forEach(input => {
                            input.removeAttribute('required');
                            input.setAttribute('data-was-required', 'true');
                        });
                        
                        // Zmodyfikuj tekst pierwszego punktu
                        const firstLocationLabel = document.querySelector('.location-entry:first-child strong');
                        if (firstLocationLabel) {
                            firstLocationLabel.innerHTML = 'First Stop (Optional if using current location)';
                        }
                    },
                    function(error) {
                        console.error("Błąd geolokalizacji:", error);
                        
                        // Wyświetl błąd
                        const alertContainer = document.createElement('div');
                        alertContainer.className = 'alert alert-danger alert-dismissible fade show mt-2';
                        alertContainer.innerHTML = `
                            <i class="fas fa-exclamation-triangle me-2"></i>Nie można pobrać lokalizacji. 
                            Sprawdź uprawnienia w przeglądarce.
                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                        `;
                        document.querySelector('.form-check-input').closest('.mb-3').appendChild(alertContainer);
                        
                        // Odznacz checkbox
                        useCurrentLocationCheckbox.checked = false;
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 0
                    }
                );
            } else {
                alert('Geolokalizacja nie jest obsługiwana przez Twoją przeglądarkę.');
                useCurrentLocationCheckbox.checked = false;
            }
        } else {
            // Wyczyść współrzędne
            document.getElementById('current_lat').value = '';
            document.getElementById('current_lon').value = '';
            
            // Przywróć wymagane pola dla pierwszej lokalizacji
            const firstLocationInputs = document.querySelectorAll('.location-entry:first-child input[data-was-required]');
            firstLocationInputs.forEach(input => {
                input.setAttribute('required', 'true');
                input.removeAttribute('data-was-required');
            });
            
            // Przywróć oryginalny tekst pierwszego punktu
            const firstLocationLabel = document.querySelector('.location-entry:first-child strong');
            if (firstLocationLabel) {
                firstLocationLabel.textContent = 'Starting Point';
            }
            
            // Usuń wszystkie alerty z tej sekcji
            const alerts = document.querySelector('.form-check-input').closest('.mb-3').querySelectorAll('.alert');
            alerts.forEach(alert => alert.remove());
        }
    }
    
    // Dodaj przycisk dodawania lokalizacji
    document.getElementById('add-location-btn').addEventListener('click', addLocationEntry);
    
    // Expose functions to global scope
    window.addLocationEntry = addLocationEntry;
    window.removeLocation = removeLocation;
    window.toggleCurrentLocationMode = toggleCurrentLocationMode;
});