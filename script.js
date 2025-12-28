// Open-Meteo API (бесплатный, без API ключа)
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
const GEO_API_URL = 'https://geocoding-api.open-meteo.com/v1/search';

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
    'Хабаровск', 'Комсомольск-на-Амуре',
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
    const url = `${WEATHER_API_URL}?latitude=${lat}&longitude=${lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,precipitation_sum&timezone=auto&forecast_days=3`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error('Ошибка API');
    }
    
    const data = await response.json();
    
    return data;
}

// Получение погоды по названию города
async function getWeatherByCity(cityName) {
    // Сначала получаем координаты города
    const geoUrl = `${GEO_API_URL}?name=${encodeURIComponent(cityName)}&count=1&language=ru`;
    const geoResponse = await fetch(geoUrl);
    
    if (!geoResponse.ok) {
        throw new Error('Ошибка получения координат города');
    }
    
    const geoData = await geoResponse.json();
    
    if (!geoData || !geoData.results || geoData.results.length === 0) {
        throw new Error('Город не найден');
    }
    
    const { latitude, longitude } = geoData.results[0];
    return await getWeatherByCoords(latitude, longitude);
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

// Преобразование weathercode в описание и иконку
function getWeatherInfo(weathercode) {
    const weatherCodes = {
        0: { desc: 'Ясно', icon: '☀️' },
        1: { desc: 'Преимущественно ясно', icon: '🌤️' },
        2: { desc: 'Переменная облачность', icon: '⛅' },
        3: { desc: 'Пасмурно', icon: '☁️' },
        45: { desc: 'Туман', icon: '🌫️' },
        48: { desc: 'Иней', icon: '🌫️' },
        51: { desc: 'Легкая морось', icon: '🌦️' },
        53: { desc: 'Умеренная морось', icon: '🌦️' },
        55: { desc: 'Сильная морось', icon: '🌦️' },
        56: { desc: 'Легкая ледяная морось', icon: '🌨️' },
        57: { desc: 'Сильная ледяная морось', icon: '🌨️' },
        61: { desc: 'Небольшой дождь', icon: '🌧️' },
        63: { desc: 'Умеренный дождь', icon: '🌧️' },
        65: { desc: 'Сильный дождь', icon: '🌧️' },
        66: { desc: 'Легкий ледяной дождь', icon: '🌨️' },
        67: { desc: 'Сильный ледяной дождь', icon: '🌨️' },
        71: { desc: 'Небольшой снег', icon: '❄️' },
        73: { desc: 'Умеренный снег', icon: '❄️' },
        75: { desc: 'Сильный снег', icon: '❄️' },
        77: { desc: 'Снежные зерна', icon: '❄️' },
        80: { desc: 'Небольшой ливень', icon: '🌦️' },
        81: { desc: 'Умеренный ливень', icon: '🌦️' },
        82: { desc: 'Сильный ливень', icon: '🌦️' },
        85: { desc: 'Небольшой снегопад', icon: '🌨️' },
        86: { desc: 'Сильный снегопад', icon: '🌨️' },
        95: { desc: 'Гроза', icon: '⛈️' },
        96: { desc: 'Гроза с градом', icon: '⛈️' },
        99: { desc: 'Гроза с сильным градом', icon: '⛈️' }
    };
    
    return weatherCodes[weathercode] || { desc: 'Неизвестно', icon: '🌤️' };
}

// Отображение карточки погоды
function displayWeather(weatherData, cityName, isCurrentLocation) {
    const { current_weather, daily } = weatherData;
    
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
    temp.textContent = `${Math.round(current_weather.temperature)}°C`;
    
    const weatherInfo = getWeatherInfo(current_weather.weathercode);
    const description = document.createElement('div');
    description.className = 'weather-description';
    description.textContent = weatherInfo.desc;
    
    const icon = document.createElement('div');
    icon.className = 'weather-icon';
    icon.style.fontSize = '80px';
    icon.style.lineHeight = '80px';
    icon.textContent = weatherInfo.icon;
    icon.setAttribute('aria-label', weatherInfo.desc);
    
    currentWeather.appendChild(temp);
    currentWeather.appendChild(icon);
    currentWeather.appendChild(description);
    
    // Детали погоды
    const details = document.createElement('div');
    details.className = 'weather-details';
    
    const windSpeed = createDetailItem('Ветер', `${Math.round(current_weather.windspeed)} км/ч`);
    const maxTemp = createDetailItem('Макс. сегодня', `${Math.round(daily.temperature_2m_max[0])}°C`);
    const minTemp = createDetailItem('Мин. сегодня', `${Math.round(daily.temperature_2m_min[0])}°C`);
    const precipitation = createDetailItem('Осадки', `${daily.precipitation_sum[0] || 0} мм`);
    
    details.appendChild(windSpeed);
    details.appendChild(maxTemp);
    details.appendChild(minTemp);
    details.appendChild(precipitation);
    
    // Прогноз на следующие дни
    const forecastSection = document.createElement('div');
    forecastSection.className = 'forecast-section';
    
    const forecastTitle = document.createElement('div');
    forecastTitle.className = 'forecast-title';
    forecastTitle.textContent = 'Прогноз на 3 дня';
    
    const forecastDays = document.createElement('div');
    forecastDays.className = 'forecast-days';
    
    // Создаем прогноз на следующие дни
    for (let i = 0; i < 3; i++) {
        const dayData = {
            date: new Date(daily.time[i]),
            temp: Math.round((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2),
            weathercode: daily.weathercode[i]
        };
        const dayElement = createForecastDay(dayData);
        forecastDays.appendChild(dayElement);
    }
    
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


// Создание элемента прогноза на день
function createForecastDay(day) {
    const dayElement = document.createElement('div');
    dayElement.className = 'forecast-day';
    
    const info = document.createElement('div');
    info.className = 'forecast-day-info';
    
    const dayName = document.createElement('div');
    dayName.className = 'forecast-day-name';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayDateObj = new Date(day.date);
    dayDateObj.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    
    if (dayDateObj.getTime() === today.getTime()) {
        dayName.textContent = 'Сегодня';
    } else if (dayDateObj.getTime() === tomorrow.getTime()) {
        dayName.textContent = 'Завтра';
    } else {
        const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
        dayName.textContent = days[dayDateObj.getDay()];
    }
    
    const dayDate = document.createElement('div');
    dayDate.className = 'forecast-day-date';
    dayDate.textContent = dayDateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    
    info.appendChild(dayName);
    info.appendChild(dayDate);
    
    const temp = document.createElement('div');
    temp.className = 'forecast-day-temp';
    
    const tempValue = document.createElement('div');
    tempValue.className = 'forecast-temp';
    tempValue.textContent = `${day.temp}°C`;
    
    const weatherInfo = getWeatherInfo(day.weathercode);
    const icon = document.createElement('div');
    icon.className = 'forecast-icon';
    icon.style.fontSize = '40px';
    icon.style.lineHeight = '40px';
    icon.textContent = weatherInfo.icon;
    icon.setAttribute('aria-label', weatherInfo.desc);
    
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

