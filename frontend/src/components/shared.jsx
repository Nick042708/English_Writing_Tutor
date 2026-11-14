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

// 渲染异常兜底：任何子树渲染出错只显示错误卡片，绝不让整页白屏
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[UI] 渲染异常：", error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return (
      <div className="card" style={{ margin: "20px auto", maxWidth: 720 }}>
        <div className="error-box">
          <b>😬 这部分内容渲染出错了</b>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            数据里可能有格式异常的内容，但不影响其他页面。切回其他标签页再回来即可重试。
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
        <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => this.setState({ error: null })}>
          重试
        </button>
      </div>
    );
  }
}
