/**
 * 样板：用超过平台请求体限额的大文件，真实传一次
 *
 * 背后的事故：UI 写着「支持 20MB」，真实用户传 5MB 照片整页崩溃、后台零日志——
 * 因为托管平台对普通请求体有 4.5MB 硬顶，超限请求在到达应用代码之前就被拒收。
 * 测试 fixture 都是几 KB 的小文件，永远撞不到这堵墙。
 *
 * 前提：上传应走「浏览器直传对象存储」架构（不经过自己服务器的请求体）。
 * 本测试用一个 5MB 文件验证整条链路在真实体积下可用。
 */
import { test, expect } from "@playwright/test";

test("5MB 大文件上传成功且页面不崩", async ({ page }) => {
  await page.goto("/your-upload-page"); // TODO: 换成你的上传页

  // 生成一个 5MB 的伪文件（超过常见平台 4.5MB 请求体硬顶）
  const bigBuffer = Buffer.alloc(5 * 1024 * 1024, 0xab);
  await page.setInputFiles('input[type="file"]', {
    name: "big-photo.jpg",
    mimeType: "image/jpeg",
    buffer: bigBuffer,
  });

  // ★核心断言 1：出现成功态（缩略图/成功提示），而不是整页崩溃
  await expect(page.getByTestId("upload-success")).toBeVisible({ timeout: 60_000 }); // TODO: 换成你的成功标识

  // ★核心断言 2：页面还活着（没有 couldn't load / 错误页）
  await expect(page.getByRole("button", { name: "提交" })).toBeEnabled();
});
