"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

type DemoAccount = { username: string; password: string };

/**
 * 演示账号来自 NEXT_PUBLIC_DEMO_ACCOUNTS（格式 user:pass,user:pass）。
 * 未配置时不渲染该卡片 —— 生产环境不会误把账号口令印在登录页上。
 */
function readDemoAccounts(): DemoAccount[] {
  const raw = process.env.NEXT_PUBLIC_DEMO_ACCOUNTS ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(":");
      if (at <= 0) return null;
      return {
        username: entry.slice(0, at).trim(),
        password: entry.slice(at + 1).trim(),
      };
    })
    .filter((account): account is DemoAccount => account !== null && account.username !== "");
}

/** 控制面稳定错误码 → 面向用户的中文文案。 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "用户名或密码不正确",
  USER_DISABLED: "账号已被禁用，请联系管理员",
};

export default function LoginPage() {
  const router = useRouter();
  const demoAccounts = useMemo(readDemoAccounts, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fillDemo(account: DemoAccount) {
    setUsername(account.username);
    setPassword(account.password);
    setUsernameError(null);
    setPasswordError(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const nextUsernameError = username.trim() ? null : "请输入用户名";
    const nextPasswordError = password ? null : "请输入密码";
    setUsernameError(nextUsernameError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextUsernameError) {
      usernameRef.current?.focus();
      return;
    }
    if (nextPasswordError) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (response.ok) {
        router.replace("/");
        router.refresh();
        return;
      }

      let code: string | undefined;
      try {
        code = ((await response.json()) as { code?: string })?.code;
      } catch {
        code = undefined;
      }

      if (response.status === 401) {
        setFormError((code && ERROR_MESSAGES[code]) || "用户名或密码不正确");
        setPassword("");
        passwordRef.current?.focus();
      } else if (response.status >= 500) {
        setFormError("服务暂时不可用，请稍后重试");
      } else {
        setFormError((code && ERROR_MESSAGES[code]) || "登录失败，请检查输入后重试");
      }
    } catch {
      setFormError("网络异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* 左：品牌区（仅在 >=1024px 显示） */}
      <aside className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden border-r border-border/60 bg-secondary/30 p-10 lg:flex xl:w-1/2 xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 28% 18%, black, transparent 72%)",
            WebkitMaskImage: "radial-gradient(ellipse at 28% 18%, black, transparent 72%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-[380px] w-[380px] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">aoteman</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            智能体工作台
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            一句话，把任务交给你的智能体。对话、工具调用、技能与过程追踪，尽在一处。
          </p>
          <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground/80">
            <Sparkles className="h-3.5 w-3.5" />
            <span>支持流式对话与多轮追问</span>
          </div>
        </div>

        <div className="relative text-xs text-muted-foreground/60">© 2026 aoteman</div>
      </aside>

      {/* 右：登录表单 */}
      <main className="relative flex w-full flex-1 flex-col">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold tracking-tight">aoteman</span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">登录</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">使用你的账号进入智能体工作台</p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  ref={usernameRef}
                  name="username"
                  autoComplete="username"
                  autoFocus
                  placeholder="请输入用户名"
                  value={username}
                  disabled={submitting}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (usernameError) setUsernameError(null);
                  }}
                  aria-invalid={usernameError ? true : undefined}
                  aria-describedby={usernameError ? "username-error" : undefined}
                />
                {usernameError && (
                  <p id="username-error" className="text-xs text-destructive">
                    {usernameError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    ref={passwordRef}
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="请输入密码"
                    className="pr-10"
                    value={password}
                    disabled={submitting}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p id="password-error" className="text-xs text-destructive">
                    {passwordError}
                  </p>
                )}
              </div>

              {formError && (
                <Alert variant="destructive" aria-live="polite">
                  <Lock className="h-4 w-4" />
                  <AlertDescription className="text-xs">{formError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    登录中…
                  </>
                ) : (
                  "登 录"
                )}
              </Button>
            </form>

            {demoAccounts.length > 0 && (
              <Collapsible className="mt-6 overflow-hidden rounded-lg border border-border/60 bg-card/60">
                <CollapsibleTrigger className="group flex w-full items-center justify-between px-3.5 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    演示账号（点击填入）
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1 border-t border-border/60 p-1.5">
                    {demoAccounts.map((account) => (
                      <button
                        key={account.username}
                        type="button"
                        onClick={() => fillDemo(account)}
                        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-1.5 font-mono text-foreground/90">
                          <UserIcon className="h-3 w-3 text-muted-foreground" />
                          {account.username}
                        </span>
                        <span className="font-mono text-muted-foreground/60">{account.password}</span>
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/60">
              登录即表示你同意遵守平台使用规范
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
