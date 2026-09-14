/**
 * 样板：表单被打回后，用户已填内容必须原样还在
 *
 * 背后的事故：React 19 把 <form action> 的「动作完结」（包括报错返回）当成重置信号——
 * 服务端校验打回的一瞬间，用户填了十分钟的内容被清空。测试全绿，因为没有任何用例
 * 断言过「打回之后，输入还在」。
 *
 * 用法：复制到你的 e2e 目录，替换 TODO 标记的选择器与路由。每个表单都配一份。
 */
import { test, expect } from "@playwright/test";

test("校验不通过被打回后，已填内容原样保留", async ({ page }) => {
  await page.goto("/your-form-page"); // TODO: 换成你的表单路由

  // 1. 填写大部分字段，但故意漏掉一个必填项
  const longText = "用户认真写了很久的内容 ".repeat(50);
  await page.getByLabel("标题").fill("测试标题"); // TODO: 换成你的字段
  await page.getByLabel("正文").fill(longText);
  // 故意不填：目标社区（必填）

  // 2. 提交，触发校验打回
  await page.getByRole("button", { name: "提交" }).click();

  // 3. 断言错误提示出现（打回确实发生了）
  await expect(page.getByText(/必填|required/i)).toBeVisible();

  // 4. ★核心断言：已填的内容必须还在
  await expect(page.getByLabel("标题")).toHaveValue("测试标题");
  await expect(page.getByLabel("正文")).toHaveValue(longText);
});
