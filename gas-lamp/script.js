const app = document.querySelector("[data-gas-lamp-app]");

if (app) {
  const ZENITH = 90.833;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const elements = {
    sunrise: document.querySelector("[data-sunrise-time]"),
    sunset: document.querySelector("[data-sunset-time]"),
    error: document.querySelector("[data-location-error]"),
  };

  const state = {
    coords: null,
    timer: null,
  };

  const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  function setText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function toDegrees(value) {
    return (value * 180) / Math.PI;
  }

  function getDayOfYear(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const timezoneOffset =
      (startOfYear.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
    return Math.floor((date - startOfYear + timezoneOffset) / ONE_DAY);
  }

  function getLocalMidnightTime(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function alignToLocalDate(date, targetDate) {
    const targetMidnight = getLocalMidnightTime(targetDate);
    const dateMidnight = getLocalMidnightTime(date);

    if (dateMidnight < targetMidnight) {
      return new Date(date.getTime() + ONE_DAY);
    }

    if (dateMidnight > targetMidnight) {
      return new Date(date.getTime() - ONE_DAY);
    }

    return date;
  }

  function calculateSunTime(date, latitude, longitude, isSunrise) {
    const dayOfYear = getDayOfYear(date);
    const longitudeHour = longitude / 15;
    const approximateTime = dayOfYear + ((isSunrise ? 6 : 18) - longitudeHour) / 24;

    const meanAnomaly = 0.9856 * approximateTime - 3.289;
    const trueLongitude = normalizeDegrees(
      meanAnomaly +
        1.916 * Math.sin(toRadians(meanAnomaly)) +
        0.02 * Math.sin(toRadians(2 * meanAnomaly)) +
        282.634,
    );

    let rightAscension = normalizeDegrees(
      toDegrees(Math.atan(0.91764 * Math.tan(toRadians(trueLongitude)))),
    );
    const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
    const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
    rightAscension = (rightAscension + longitudeQuadrant - ascensionQuadrant) / 15;

    const sinDeclination = 0.39782 * Math.sin(toRadians(trueLongitude));
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const cosLocalHour =
      (Math.cos(toRadians(ZENITH)) -
        sinDeclination * Math.sin(toRadians(latitude))) /
      (cosDeclination * Math.cos(toRadians(latitude)));

    if (cosLocalHour > 1) {
      return { type: "never-rises" };
    }

    if (cosLocalHour < -1) {
      return { type: "never-sets" };
    }

    const localHourAngle = isSunrise
      ? 360 - toDegrees(Math.acos(cosLocalHour))
      : toDegrees(Math.acos(cosLocalHour));
    const localMeanTime =
      localHourAngle / 15 + rightAscension - 0.06571 * approximateTime - 6.622;
    const universalTime = ((localMeanTime - longitudeHour) % 24 + 24) % 24;
    const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const eventDate = new Date(utcMidnight + universalTime * 60 * 60 * 1000);

    return {
      type: "time",
      date: alignToLocalDate(eventDate, date),
    };
  }

  function formatSunTime(result, kind) {
    if (result.type === "time") {
      return timeFormatter.format(result.date);
    }

    if (result.type === "never-rises") {
      return "なし";
    }

    return kind === "sunset" ? "沈まない" : "なし";
  }

  function showLocationError(message) {
    if (elements.error) {
      elements.error.hidden = false;
      elements.error.textContent = message;
    }
  }

  function setCoords(coords) {
    state.coords = coords;
    if (elements.error) {
      elements.error.hidden = true;
      elements.error.textContent = "";
    }
    render();
  }

  function renderPending() {
    app.dataset.phase = "unknown";
    setText(elements.sunrise, "--:--");
    setText(elements.sunset, "--:--");
  }

  function render() {
    const now = new Date();

    if (!state.coords) {
      renderPending();
      return;
    }

    const sunrise = calculateSunTime(
      now,
      state.coords.latitude,
      state.coords.longitude,
      true,
    );
    const sunset = calculateSunTime(
      now,
      state.coords.latitude,
      state.coords.longitude,
      false,
    );

    setText(elements.sunrise, formatSunTime(sunrise, "sunrise"));
    setText(elements.sunset, formatSunTime(sunset, "sunset"));

    if (sunrise.type === "never-rises" || sunset.type === "never-rises") {
      app.dataset.phase = "night";
      return;
    }

    if (sunrise.type === "never-sets" || sunset.type === "never-sets") {
      app.dataset.phase = "day";
      return;
    }

    const isDay = now >= sunrise.date && now < sunset.date;
    app.dataset.phase = isDay ? "day" : "night";
  }

  function startClock() {
    window.clearInterval(state.timer);
    state.timer = window.setInterval(render, 60 * 1000);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      showLocationError("このブラウザでは現在地を取得できません。");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        showLocationError(
          "現在地を取得できませんでした。ブラウザの位置情報設定を確認してください。",
        );
      },
      {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: 10000,
      },
    );
  }

  render();
  requestLocation();
  startClock();
}
