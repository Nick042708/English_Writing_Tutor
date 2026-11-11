import React, { useState } from "react";
import { fetchMaterials } from "../api.js";
import { Loading } from "./shared.jsx";
import MaterialsResult from "./MaterialsResult.jsx";

// 素材提供页：填写任务 → 生成 → 复用 MaterialsResult 展示（历史回看也用它）
export default function MaterialsPage({ profile, task, setTask }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!task.trim()) {
      setError("请先填写写作任务，例如题目原文或你想写的主题");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResult(await fetchMaterials({ ...profile, task: task.trim() }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2><span className="dot" />你的写作任务</h2>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="粘贴题目原文，或用一两句话描述你想写什么，例如：Some people think students should take a gap year before university. Discuss both views and give your own opinion."
        />
        <button className="btn" onClick={generate} disabled={loading}>
          {loading ? "正在生成…" : "生成写作素材"}
        </button>
        {result && !loading && (
          <>
            <button className="btn-ghost" style={{ marginLeft: 12, marginTop: 12 }} onClick={generate}>
              全部换一批
            </button>
            {result.demo && <span className="demo-tag">演示数据</span>}
          </>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && (
        <div className="card">
          <Loading text="正在根据你的水平和任务定制素材，内容较多，大约需要 30-60 秒…" />
        </div>
      )}

      {result && !loading && (
        <MaterialsResult result={result} profile={profile} task={task.trim()} />
      )}
    </>
  );
}
