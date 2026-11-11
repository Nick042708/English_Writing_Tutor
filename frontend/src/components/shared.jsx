import React, { useCallback, useEffect, useState } from "react";

const FAV_KEY = "ewt-favorites";

export function readFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(readFavorites);

  const persist = useCallback((next) => {
    setFavorites(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  }, []);

  const toggle = useCallback(
    (item) => {
      const exists = favorites.some((f) => f.key === item.key);
      persist(exists ? favorites.filter((f) => f.key !== item.key) : [...favorites, item]);
    },
    [favorites, persist]
  );

  const remove = useCallback((key) => persist(favorites.filter((f) => f.key !== key)), [favorites, persist]);

  const has = useCallback((key) => favorites.some((f) => f.key === key), [favorites]);

  return { favorites, toggle, remove, has };
}

export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button className={`btn-ghost ${copied ? "copied" : ""}`} onClick={copy}>
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function FavButton({ faved, onClick }) {
  return (
    <button className={`btn-ghost ${faved ? "faved" : ""}`} onClick={onClick}>
      {faved ? "已收藏" : "收藏"}
    </button>
  );
}

export function Loading({ text }) {
  return (
    <div className="loading">
      <span className="spinner" />
      {text}
    </div>
  );
}
