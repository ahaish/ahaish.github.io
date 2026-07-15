const app = document.querySelector("[data-gas-lamp-app]");

if (app) {
  // 太陽の中心が地平線より少し下にある状態を、日の出・日の入りの目安にする。
  // 0.833度ぶんは大気で光が曲がる分などを含めた補正。
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
    // 角度計算で扱いやすいように、値を 0度以上 360度未満へ戻す。
    return ((value % 360) + 360) % 360;
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function toDegrees(value) {
    return (value * 180) / Math.PI;
  }

  function getDayOfYear(date) {
    // 季節によって太陽の通り道が変わるため、今日が年の何日目かを使う。
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const timezoneOffset =
      (startOfYear.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
    return Math.floor((date - startOfYear + timezoneOffset) / ONE_DAY);
  }

  function getLocalMidnightTime(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function alignToLocalDate(date, targetDate) {
    // 計算結果は UTC の時刻なので、日本などでは日付が前後にずれることがある。
    // 画面では「端末の今日」の日の出・日の入りとして扱えるよう、同じローカル日付に揃える。
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
    // 日付と経度から、日の出なら朝6時ごろ、日の入りなら夕方6時ごろを仮の計算開始点にする。
    const dayOfYear = getDayOfYear(date);
    const longitudeHour = longitude / 15;
    const approximateTime = dayOfYear + ((isSunrise ? 6 : 18) - longitudeHour) / 24;

    // その日の太陽が、地球から見て軌道上のどのあたりにいるかを近似する。
    const meanAnomaly = 0.9856 * approximateTime - 3.289;
    const trueLongitude = normalizeDegrees(
      meanAnomaly +
        1.916 * Math.sin(toRadians(meanAnomaly)) +
        0.02 * Math.sin(toRadians(2 * meanAnomaly)) +
        282.634,
    );

    // 太陽の位置を、空の横方向の座標として扱える形へ変換する。
    let rightAscension = normalizeDegrees(
      toDegrees(Math.atan(0.91764 * Math.tan(toRadians(trueLongitude)))),
    );
    const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
    const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
    rightAscension = (rightAscension + longitudeQuadrant - ascensionQuadrant) / 15;

    // 緯度と太陽の高さから、地平線付近に来る角度を求める。
    const sinDeclination = 0.39782 * Math.sin(toRadians(trueLongitude));
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const cosLocalHour =
      (Math.cos(toRadians(ZENITH)) -
        sinDeclination * Math.sin(toRadians(latitude))) /
      (cosDeclination * Math.cos(toRadians(latitude)));

    if (cosLocalHour > 1) {
      // 極夜などで、この日は太陽が地平線より上に来ない。
      return { type: "never-rises" };
    }

    if (cosLocalHour < -1) {
      // 白夜などで、この日は太陽が沈まない。
      return { type: "never-sets" };
    }

    // 地平線に来る角度を時刻へ変換し、UTC の日の出・日の入り時刻にする。
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

    // 太陽が出ない日は夜、沈まない日は昼として表示する。
    if (sunrise.type === "never-rises" || sunset.type === "never-rises") {
      app.dataset.phase = "night";
      return;
    }

    if (sunrise.type === "never-sets" || sunset.type === "never-sets") {
      app.dataset.phase = "day";
      return;
    }

    // 現在時刻が日の出以上、日の入りより前なら昼。そこから外れた時間は夜。
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
