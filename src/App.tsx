import { useState, useEffect, useRef, useCallback } from "react";
import './App.css'
import Switch from './img/switch-icon.png'
import Wifi from './img/wifi-on-icon.png'
import currenciesData from './currencies.json'
// === Типы ===
type CurrencyCode = string;

interface Currency {
  name: string;
  symbol: string;
  symbolNative: string;
  decimalDigits: number;
  rounding: number;
  code: CurrencyCode;
  namePlural: string;
  countryCodeISO2: string;
  flagSrc: string;
}

interface Rates {
  [key: string]: number;
}

interface RateData {
  base: string;
  rates: Rates;
  timestamp: number;
  date: string;
}

// === Константы ===
const CACHE_KEY = "currency_rates_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 минут
const API_URL = "https://api.vatcomply.com/rates";

// Список валют (можно загрузить с сервера, но здесь встроен)

const CURRENCIES: Currency[] = [
  {
      name: "US Dollar",
      symbol: "$",
      symbolNative: "$",
      decimalDigits: 2,
      rounding: 0,
      code: "USD",
      namePlural: "US dollars",
      countryCodeISO2: "US",
      flagSrc: "https://flagcdn.com/h40/us.png"
  },
  {
      name: "Canadian Dollar",
      symbol: "CA$",
      symbolNative: "$",
      decimalDigits: 2,
      rounding: 0,
      code: "CAD",
      namePlural: "Canadian dollars",
      countryCodeISO2: "CA",
      flagSrc: "https://flagcdn.com/h40/ca.png"
  },
  {
      name: "Euro",
      symbol: "€",
      symbolNative: "€",
      decimalDigits: 2,
      rounding: 0,
      code: "EUR",
      namePlural: "euros",
      countryCodeISO2: "IE",
      flagSrc: "https://flagcdn.com/h40/ie.png"
  },
  {
      name: "United Arab Emirates Dirham",
      symbol: "AED",
      symbolNative: "د.إ.‏",
      decimalDigits: 2,
      rounding: 0,
      code: "AED",
      namePlural: "UAE dirhams",
      countryCodeISO2: "AE",
      flagSrc: "https://flagcdn.com/h40/ae.png"
  },
  {
      name: "Afghan Afghani",
      symbol: "Af",
      symbolNative: "؋",
      decimalDigits: 0,
      rounding: 0,
      code: "AFN",
      namePlural: "Afghan Afghanis",
      countryCodeISO2: "AF",
      flagSrc: "https://flagcdn.com/h40/af.png"
  },
  {
      name: "Albanian Lek",
      symbol: "ALL",
      symbolNative: "Lek",
      decimalDigits: 0,
      rounding: 0,
      code: "ALL",
      namePlural: "Albanian lekë",
      countryCodeISO2: "AL",
      flagSrc: "https://flagcdn.com/h40/al.png"
  },
  // ...и так далее, вставляешь все элементы массива
];

// Маппинг кода → объект валюты
const CURRENCY_MAP = CURRENCIES.reduce((acc, curr) => {
  acc[curr.code] = curr;
  return acc;
}, {} as Record<CurrencyCode, Currency>);

// === Хелперы ===
const formatAmount = (value: string | number, currencyCode: CurrencyCode): string => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  const currency = CURRENCY_MAP[currencyCode] || { decimalDigits: 2 };
  return num.toLocaleString(undefined, {
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits,
  });
};

const convertCurrency = (amount: number, from: string, to: string, rates: Rates): number => {
  if (from === to) return amount;
  const rateFrom = rates[from];
  const rateTo = rates[to];
  if (rateFrom == null || rateTo == null) console.log('Error');
  return (amount / rateFrom) * rateTo;
};

const getCachedRates = (): RateData | null => {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return null;
  const parsed: RateData = JSON.parse(cached);
  return Date.now() - parsed.timestamp < CACHE_TTL ? parsed : null;
};

const setCachedRates = (data: RateData) => {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
};

const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

// === Основной компонент ===
function App() {
  const [amount, setAmount] = useLocalStorage<string>("conv_amount", "1");
  const [from, setFrom] = useLocalStorage<CurrencyCode>("conv_from", "USD");
  const [to, setTo] = useLocalStorage<CurrencyCode>("conv_to", "EUR");
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [rates, setRates] = useState<Rates | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [selectorOpen, setSelectorOpen] = useState<"from" | "to" | null>(null);
  const [search, setSearch] = useState<string>("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedAmount = useDebounce(amount, 250);

  // Загрузка курсов
  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Network error");
      const { rates, base, date } = await res.json();
      console.log("API Response:", base);

      const timestamp = Date.now();
      const rateData: RateData = { base, rates, timestamp, date };
      console.log(rateData)
      setRates(rates);
      setLastUpdated(timestamp);
      setCachedRates(rateData);
      setError(null);
    } catch (err) {
      const cached = getCachedRates();
      if (cached) {
        setRates(cached.rates);
        setLastUpdated(cached.timestamp);
        setError("Offline: using cached data");
      } else {
        setError("Failed to load exchange rates");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Первичная загрузка
  useEffect(() => {
    const cached = getCachedRates();
    if (cached) {
      setRates(cached.rates);
      setLastUpdated(cached.timestamp);
    }
    loadRates();

    const handleOnline = () => {
      setIsOnline(true);
      const cached = getCachedRates();
      if (!cached || Date.now() - cached.timestamp >= CACHE_TTL) {
        loadRates();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadRates]);
  console.log(rates)
  // Пересчёт
  useEffect(() => {
    if (!rates || !debouncedAmount || !from || !to) return;
    try {
      const num = parseFloat(debouncedAmount);
      if (isNaN(num) || num <= 0) {
        setResult(null);
        return;
      }
      const converted = convertCurrency(num, from, to, rates);
      setResult(converted);
    } catch (e) {
      setError("Invalid currency");
      setResult(null);
    }
  }, [debouncedAmount, from, to, rates]);
console.log(rates)
  // Обработка клавиатуры
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectorOpen) return;
      if (e.key === "Escape") setSelectorOpen(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectorOpen]);

  const handleSwap = () => {
    setFrom(to);
    setTo(from);
  };

  const handleSelect = (code: CurrencyCode) => {
    if (selectorOpen === "from") setFrom(code);
    if (selectorOpen === "to") setTo(code);
    setSelectorOpen(null);
  };

  const filteredCurrencies = CURRENCIES.filter(
    (curr) =>
      curr.code.toLowerCase().includes(search.toLowerCase()) ||
      curr.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const fromCurrency = CURRENCY_MAP[from];
  const toCurrency = CURRENCY_MAP[to];

  return (
    <div className="container">
    
      {/* Заголовок */}
      <header>
      <h1>Currency converter</h1>
      <p>Get real-time exchange rates</p>
    </header>

      <div className="status-bar">
      <span className="online">

        
      {isOnline ? <span className="onliimn"><img src={Wifi} alt="" className="imgonli"/> <span>Online</span></span> : 
      `🕒 Using cached rates from ${formatTime(lastUpdated)}`}
      </span>
      <span className="last-updated"></span>
      <button className="refresh-btn" onClick={loadRates} disabled={loading}>
        🔄 {loading ? "Loading..." : "Refresh"}</button>
      </div>
        <div className="main-content">
        <div className="input-section">
          <label htmlFor="amount" className="label">
            Amount
          </label>
          <div className="amount-input">
            
            
            <input
              type="text"
              id="amount"
              inputMode="decimal"
              placeholder="1"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(",", ".");
                if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
                  setAmount(raw);
                }
              }}
              
            />
          </div>
          <div className="currency-pair">
          <div
            onClick={() => setSelectorOpen("from")}
            className="from"
          >
            <label className="label">From</label>
            <div id='from'>
            <span className="chircl"><p>
              {fromCurrency?.symbol}</p></span>
              <div>
                <span className="code">{from}</span><br/>
                <span className="name">{fromCurrency?.name}</span>
              </div>
            </div>
          </div>

          <button onClick={handleSwap} className="swap-btn">
            <img src={Switch} alt="" />
          </button>

          <div
            onClick={() => setSelectorOpen("to")}
            className="to"
          >
            <label className="label">To</label>
            <div id="to">
            <span className="chircl"><p>
              {toCurrency?.symbol}</p></span>
              <div>
                
                <span className="code">{to}</span><br/>
                <span className="name">{toCurrency?.name}</span>
              </div>
            </div>
          </div>
        </div>
        </div>

        
        

        {/* Результат */}
        <div className="result-section">
        <h2>Conversion result</h2>
        {result !== null ? (
        <div className="result-value">
          <span className="amount">
          {to}
          <strong>{formatAmount(result, to)}</strong> 
          </span>
          <span className="unit">1 {from} →</span>
        </div>
        ) : (
          <p className="placeholder">Enter amount</p>
        )}
        <div className="rates">
          <div className="rate-item">
            <span className="label">Exchange Rate</span>
            <span className="value">
            1 {from} = {convertCurrency(1, from, to, rates || {}).toFixed(6)} {to}
            </span>
          </div>
          <div className="rate-item">
            <span className="label">Inverse Rate</span>
            <span className="value">
            1 {to} = {convertCurrency(1, to, from, rates || {}).toFixed(6)} {from}
            </span>
          </div>
        </div>

        <div className="disclaimer">
          Rates are for informational purposes only and may not reflect real-time market rates.
        </div>
      </div>
        
    
    </div>

    {/* Модальное окно выбора */}
    {selectorOpen && (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-header">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search currency..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
              autoFocus
            />
          </div>
          <ul className="currency-list">
            {filteredCurrencies.map((curr) => (
              <li
                key={curr.code}
                onClick={() => handleSelect(curr.code)}
                className={`currency-item ${
                  curr.code === (selectorOpen === "from" ? from : to)
                    ? "selected"
                    : ""
                }`}
              >
                <img
                  src={curr.flagSrc}
                  alt={curr.code}
                  className="flag"
                />
                <div>
                  <div className="code">{curr.code} ({curr.symbol})</div>
                  <div className="name">{curr.name}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )}
  </div>
  );
}

export default App;