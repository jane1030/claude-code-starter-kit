/**
 * 样板：LLM 批量返回乱序 / 漏答 / 多答时，解析代码不崩、不张冠李戴
 *
 * 背后的事故：批量调 LLM 的解析代码按数组下标对齐结果——正常响应下永远是绿的，
 * 生产里一次乱序就全部张冠李戴。这条教训写进项目规范后仍然复发了 3 次，
 * 因为「正常响应测不出它」。所以畸形响应用例必须是标配。
 *
 * 约定：你的解析函数应按业务 ID 对齐（要求 LLM 原样带回每条的 id），
 * 漏答的条目标记为「未处理”而不是报错或错配。
 */
import { describe, it, expect } from "vitest";
// TODO: 换成你的解析函数
import { alignBatchResults } from "../src/llm/align";

const inputs = [
  { id: "a", text: "第一条" },
  { id: "b", text: "第二条" },
  { id: "c", text: "第三条" },
];

describe("LLM 批量返回对齐", () => {
  it("乱序返回：仍按 id 对到正确的输入上", () => {
    const resp = [
      { id: "c", result: "答三" },
      { id: "a", result: "答一" },
      { id: "b", result: "答二" },
    ];
    const out = alignBatchResults(inputs, resp);
    expect(out.get("a")).toBe("答一");
    expect(out.get("c")).toBe("答三");
  });

  it("漏答：缺失条目标记为未处理，而不是错位或抛错", () => {
    const resp = [{ id: "a", result: "答一" }]; // b、c 被 LLM 漏掉
    const out = alignBatchResults(inputs, resp);
    expect(out.get("a")).toBe("答一");
    expect(out.get("b")).toBeUndefined(); // 未处理，等待重试
    expect(out.get("c")).toBeUndefined();
  });

  it("多答/幻觉 id：清单外的 id 被丢弃，不污染结果", () => {
    const resp = [
      { id: "a", result: "答一" },
      { id: "zzz", result: "幻觉条目" },
    ];
    const out = alignBatchResults(inputs, resp);
    expect(out.get("a")).toBe("答一");
    expect([...out.keys()]).not.toContain("zzz");
  });

  it("完全坏掉的响应：返回空结果集而不是抛异常打断整个批次", () => {
    const out = alignBatchResults(inputs, null as never);
    expect(out.size).toBe(0);
  });
});
