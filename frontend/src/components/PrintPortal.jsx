import React, { useEffect } from "react";
import { createPortal } from "react-dom";

// 导出 PDF 的实现：把报告渲染到 body 下的隐藏容器，触发浏览器打印
// 用户在打印对话框中选择「另存为 PDF」即可得到文件
export default function PrintPortal({ content, onDone }) {
  useEffect(() => {
    if (!content) return undefined;
    const t = setTimeout(() => {
      window.print();
      onDone();
    }, 150);
    return () => clearTimeout(t);
  }, [content, onDone]);

  if (!content) return null;
  return createPortal(<div className="print-root">{content}</div>, document.body);
}
