// API ключ для OpenWeatherMap (нужно заменить на свой)
const API_KEY = 'YOUR_API_KEY_HERE';
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_API_URL = 'https://api.openweathermap.org/geo/1.0';

// Состояние приложения
const appState = {
    cities: [],
    currentLocation: null,
    isLoading: false
};

// Популярные города для выпадающего списка
const POPULAR_CITIES = [
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
    'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
    'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград',
    'Лондон', 'Париж', 'Берлин', 'Мадрид', 'Рим',
    'Нью-Йорк', 'Лос-Анджелес', 'Чикаго', 'Токио', 'Пекин'
];

// DOM элементы
const elements = {
    weatherContainer: document.getElementById('weatherContainer'),
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.querySelector('.error-message'),
    refreshBtn: document.getElementById('refreshBtn'),
    addCityBtn: document.getElementById('addCityBtn'),
    cityModal: document.getElementById('cityModal'),
    closeModal: document.getElementById('closeModal'),
    cityInput: document.getElementById('cityInput'),
    cityDropdown: document.getElementById('cityDropdown'),
    cityError: document.getElementById('cityError'),
    submitCityBtn: document.getElementById('submitCityBtn')
};

// Инициализация приложения
function init() {
    loadStateFromStorage();
    setupEventListeners();
    
    if (appState.currentLocation || appState.cities.length > 0) {
        loadAllWeather();
    } else {
        requestGeolocation();
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    elements.refreshBtn.addEventListener('click', handleRefresh);
    elements.addCityBtn.addEventListener('click', openCityModal);
    elements.closeModal.addEventListener('click', closeCityModal);
    elements.submitCityBtn.addEventListener('click', handleAddCity);
    elements.cityInput.addEventListener('input', handleCityInput);
    elements.cityInput.addEventListener('keydown', handleCityInputKeydown);
    
    // Закрытие модального окна при клике вне его
    elements.cityModal.addEventListener('click', (e) => {
        if (e.target === elements.cityModal) {
            closeCityModal();
        }
    });
}

// Запрос геолокации
function requestGeolocation() {
    if (!navigator.geolocation) {
        showError('Геолокация не поддерживается вашим браузером');
        openCityModal();
        return;
    }

    showLoading();
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const weatherData = await getWeatherByCoords(latitude, longitude);
                appState.currentLocation = {
                    type: 'geolocation',
                    coords: { lat: latitude, lon: longitude },
                    name: 'Текущее местоположение'
                };
                saveStateToStorage();
                displayWeather(weatherData, appState.currentLocation.name, true);
                hideLoading();
            } catch (error) {
                console.error('Ошибка получения погоды:', error);
                showError('Не удалось получить данные о погоде для вашего местоположения');
                hideLoading();
                openCityModal();
            }
        },
        (error) => {
            console.error('Ошибка геолокации:', error);
            hideLoading();
            openCityModal();
        }
    );
}

// Получение погоды по координатам
async function getWeatherByCoords(lat, lon) {
    const currentUrl = `${WEATHER_API_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ru`;
    const forecastUrl = `${WEATHER_API_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ru`;
    
    const [currentResponse, forecastResponse] = await Promise.all([
        fetch(currentUrl),
        fetch(forecastUrl)
    ]);
    
    if (!currentResponse.ok || !forecastResponse.ok) {
        throw new Error('Ошибка API');
    }
    
    const current = await currentResponse.json();
    const forecast = await forecastResponse.json();
    
    return { current, forecast };
}

// Получение погоды по названию города
async function getWeatherByCity(cityName) {
    // Сначала получаем координаты города
    const geoUrl = `${GEO_API_URL}/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${API_KEY}`;
    const geoResponse = await fetch(geoUrl);
    
    if (!geoResponse.ok) {
        throw new Error('Ошибка получения координат города');
    }
    
    const geoData = await geoResponse.json();
    
    if (!geoData || geoData.length === 0) {
        throw new Error('Город не найден');
    }
    
    const { lat, lon } = geoData[0];
    return await getWeatherByCoords(lat, lon);
}

// Загрузка погоды для всех сохраненных городов
async function loadAllWeather() {
    showLoading();
    elements.weatherContainer.textContent = '';
    
    try {
        const promises = [];
        
        // Загрузка текущего местоположения
        if (appState.currentLocation) {
            if (appState.currentLocation.type === 'geolocation') {
                promises.push(
                    getWeatherByCoords(
                        appState.currentLocation.coords.lat,
                        appState.currentLocation.coords.lon
                    ).then(data => ({
                        data,
                        name: appState.currentLocation.name,
                        isCurrentLocation: true
                    }))
                );
            } else if (appState.currentLocation.type === 'city') {
                promises.push(
                    getWeatherByCity(appState.currentLocation.name).then(data => ({
                        data,
                        name: appState.currentLocation.name,
                        isCurrentLocation: true
                    }))
                );
            }
        }
        
        // Загрузка дополнительных городов
        appState.cities.forEach(city => {
            promises.push(
                getWeatherByCity(city).then(data => ({
                    data,
                    name: city,
                    isCurrentLocation: false
                }))
            );
        });
        
        const results = await Promise.allSettled(promises);
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const { data, name, isCurrentLocation } = result.value;
                displayWeather(data, name, isCurrentLocation);
            } else {
                console.error('Ошибка загрузки погоды:', result.reason);
            }
        });
        
        hideLoading();
    } catch (error) {
        console.error('Ошибка загрузки погоды:', error);
        showError('Не удалось загрузить данные о погоде');
        hideLoading();
    }
}

// Отображение карточки погоды
function displayWeather(weatherData, cityName, isCurrentLocation) {
    const { current, forecast } = weatherData;
    
    // Создание элементов без innerHTML
    const card = document.createElement('div');
    card.className = 'weather-card';
    
    // Заголовок карточки
    const header = document.createElement('div');
    header.className = 'weather-card-header';
    
    const title = document.createElement('div');
    title.className = 'weather-card-title';
    title.textContent = cityName;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-city-btn';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Удалить город');
    
    if (!isCurrentLocation) {
        removeBtn.addEventListener('click', () => removeCity(cityName));
    } else {
        removeBtn.style.display = 'none';
    }
    
    header.appendChild(title);
    header.appendChild(removeBtn);
    
    // Текущая погода
    const currentWeather = document.createElement('div');
    currentWeather.className = 'current-weather';
    
    const temp = document.createElement('div');
    temp.className = 'temperature';
    temp.textContent = `${Math.round(current.main.temp)}°C`;
    
    const description = document.createElement('div');
    description.className = 'weather-description';
    description.textContent = current.weather[0].description;
    
    const icon = document.createElement('img');
    icon.className = 'weather-icon';
    icon.src = `https://openweathermap.org/img/wn/${current.weather[0].icon}@2x.png`;
    icon.alt = current.weather[0].description;
    
    currentWeather.appendChild(temp);
    currentWeather.appendChild(icon);
    currentWeather.appendChild(description);
    
    // Детали погоды
    const details = document.createElement('div');
    details.className = 'weather-details';
    
    const feelsLike = createDetailItem('Ощущается', `${Math.round(current.main.feels_like)}°C`);
    const humidity = createDetailItem('Влажность', `${current.main.humidity}%`);
    const pressure = createDetailItem('Давление', `${Math.round(current.main.pressure * 0.75)} мм рт.ст.`);
    const windSpeed = createDetailItem('Ветер', `${Math.round(current.wind.speed)} м/с`);
    
    details.appendChild(feelsLike);
    details.appendChild(humidity);
    details.appendChild(pressure);
    details.appendChild(windSpeed);
    
    // Прогноз на следующие дни
    const forecastSection = document.createElement('div');
    forecastSection.className = 'forecast-section';
    
    const forecastTitle = document.createElement('div');
    forecastTitle.className = 'forecast-title';
    forecastTitle.textContent = 'Прогноз на 3 дня';
    
    const forecastDays = document.createElement('div');
    forecastDays.className = 'forecast-days';
    
    // Группируем прогноз по дням
    const dailyForecast = groupForecastByDay(forecast.list);
    
    dailyForecast.slice(0, 3).forEach(day => {
        const dayElement = createForecastDay(day);
        forecastDays.appendChild(dayElement);
    });
    
    forecastSection.appendChild(forecastTitle);
    forecastSection.appendChild(forecastDays);
    
    // Сборка карточки
    card.appendChild(header);
    card.appendChild(currentWeather);
    card.appendChild(details);
    card.appendChild(forecastSection);
    
    elements.weatherContainer.appendChild(card);
}

// Создание элемента детали
function createDetailItem(label, value) {
    const item = document.createElement('div');
    item.className = 'detail-item';
    
    const labelEl = document.createElement('div');
    labelEl.className = 'detail-label';
    labelEl.textContent = label;
    
    const valueEl = document.createElement('div');
    valueEl.className = 'detail-value';
    valueEl.textContent = value;
    
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    
    return item;
}

// Группировка прогноза по дням
function groupForecastByDay(forecastList) {
    const days = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    forecastList.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dayKey = date.toDateString();
        
        if (!days[dayKey]) {
            days[dayKey] = {
                date: new Date(date),
                items: []
            };
        }
        
        days[dayKey].items.push(item);
    });
    
    // Преобразуем в массив и сортируем
    return Object.values(days)
        .sort((a, b) => a.date - b.date)
        .map(day => ({
            date: day.date,
            temp: Math.round(day.items[0].main.temp),
            icon: day.items[0].weather[0].icon,
            description: day.items[0].weather[0].description
        }));
}

// Создание элемента прогноза на день
function createForecastDay(day) {
    const dayElement = document.createElement('div');
    dayElement.className = 'forecast-day';
    
    const info = document.createElement('div');
    info.className = 'forecast-day-info';
    
    const dayName = document.createElement('div');
    dayName.className = 'forecast-day-name';
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    
    if (day.date.toDateString() === today.toDateString()) {
        dayName.textContent = 'Сегодня';
    } else if (day.date.toDateString() === tomorrow.toDateString()) {
        dayName.textContent = 'Завтра';
    } else {
        const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
        dayName.textContent = days[day.date.getDay()];
    }
    
    const dayDate = document.createElement('div');
    dayDate.className = 'forecast-day-date';
    dayDate.textContent = day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    
    info.appendChild(dayName);
    info.appendChild(dayDate);
    
    const temp = document.createElement('div');
    temp.className = 'forecast-day-temp';
    
    const tempValue = document.createElement('div');
    tempValue.className = 'forecast-temp';
    tempValue.textContent = `${day.temp}°C`;
    
    const icon = document.createElement('img');
    icon.className = 'forecast-icon';
    icon.src = `https://openweathermap.org/img/wn/${day.icon}@2x.png`;
    icon.alt = day.description;
    
    temp.appendChild(tempValue);
    temp.appendChild(icon);
    
    dayElement.appendChild(info);
    dayElement.appendChild(temp);
    
    return dayElement;
}

// Обработка обновления
async function handleRefresh() {
    if (appState.isLoading) return;
    
    elements.refreshBtn.classList.add('loading');
    elements.refreshBtn.disabled = true;
    
    await loadAllWeather();
    
    elements.refreshBtn.classList.remove('loading');
    elements.refreshBtn.disabled = false;
}

// Открытие модального окна добавления города
function openCityModal() {
    elements.cityModal.classList.remove('hidden');
    elements.cityInput.focus();
    elements.cityInput.value = '';
    elements.cityError.classList.add('hidden');
    elements.cityDropdown.classList.add('hidden');
}

// Закрытие модального окна
function closeCityModal() {
    elements.cityModal.classList.add('hidden');
    elements.cityInput.value = '';
    elements.cityError.classList.add('hidden');
    elements.cityDropdown.classList.add('hidden');
}

// Обработка ввода города
function handleCityInput(e) {
    const value = e.target.value.trim();
    
    if (value.length === 0) {
        elements.cityDropdown.classList.add('hidden');
        return;
    }
    
    // Фильтруем города по введенному тексту
    const filtered = POPULAR_CITIES.filter(city =>
        city.toLowerCase().startsWith(value.toLowerCase())
    );
    
    if (filtered.length > 0) {
        showCityDropdown(filtered);
    } else {
        elements.cityDropdown.classList.add('hidden');
    }
}

// Показать выпадающий список городов
function showCityDropdown(cities) {
    elements.cityDropdown.textContent = '';
    elements.cityDropdown.classList.remove('hidden');
    
    cities.slice(0, 5).forEach(city => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = city;
        item.addEventListener('click', () => {
            elements.cityInput.value = city;
            elements.cityDropdown.classList.add('hidden');
        });
        elements.cityDropdown.appendChild(item);
    });
}

// Обработка нажатий клавиш в поле ввода
function handleCityInputKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCity();
    } else if (e.key === 'Escape') {
        closeCityModal();
    }
}

// Добавление города
async function handleAddCity() {
    const cityName = elements.cityInput.value.trim();
    
    if (!cityName) {
        showCityError('Введите название города');
        return;
    }
    
    // Проверка на дубликаты
    if (appState.cities.includes(cityName) || 
        (appState.currentLocation && appState.currentLocation.name === cityName)) {
        showCityError('Этот город уже добавлен');
        return;
    }
    
    elements.submitCityBtn.disabled = true;
    elements.submitCityBtn.textContent = 'Загрузка...';
    elements.cityError.classList.add('hidden');
    
    try {
        await getWeatherByCity(cityName);
        
        // Если текущее местоположение не установлено, устанавливаем его
        if (!appState.currentLocation) {
            appState.currentLocation = {
                type: 'city',
                name: cityName
            };
        } else {
            // Иначе добавляем как дополнительный город
            appState.cities.push(cityName);
        }
        
        saveStateToStorage();
        closeCityModal();
        await loadAllWeather();
    } catch (error) {
        console.error('Ошибка добавления города:', error);
        showCityError('Город не найден. Проверьте правильность написания.');
    } finally {
        elements.submitCityBtn.disabled = false;
        elements.submitCityBtn.textContent = 'Добавить';
    }
}

// Показать ошибку в поле ввода города
function showCityError(message) {
    elements.cityError.textContent = message;
    elements.cityError.classList.remove('hidden');
}

// Удаление города
async function removeCity(cityName) {
    appState.cities = appState.cities.filter(c => c !== cityName);
    saveStateToStorage();
    await loadAllWeather();
}

// Показать состояние загрузки
function showLoading() {
    appState.isLoading = true;
    elements.loadingState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
    elements.weatherContainer.classList.add('hidden');
}

// Скрыть состояние загрузки
function hideLoading() {
    appState.isLoading = false;
    elements.loadingState.classList.add('hidden');
    elements.weatherContainer.classList.remove('hidden');
}

// Показать ошибку
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorState.classList.remove('hidden');
    elements.loadingState.classList.add('hidden');
    elements.weatherContainer.classList.add('hidden');
}

// Сохранение состояния в localStorage
function saveStateToStorage() {
    localStorage.setItem('weatherAppState', JSON.stringify({
        currentLocation: appState.currentLocation,
        cities: appState.cities
    }));
}

// Загрузка состояния из localStorage
function loadStateFromStorage() {
    const saved = localStorage.getItem('weatherAppState');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            appState.currentLocation = state.currentLocation || null;
            appState.cities = state.cities || [];
        } catch (error) {
            console.error('Ошибка загрузки состояния:', error);
        }
    }
}

// Запуск приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', init);

