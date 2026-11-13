import React from "react";
import { marked } from "marked";

// 轻量 Markdown 渲染（内容仅由管理员发布，可信来源）
// 支持：标题、粗体/斜体、列表、表格、代码块、引用、链接、图片
marked.setOptions({ breaks: true, gfm: true });

export default function Markdown({ text, className = "" }) {
  const html = marked.parse(String(text || ""));
  return <div className={`md-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
