'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ButtonProps } from '@/components/ui/button';
import { SkillRequestError, uploadSkill } from '@/lib/skills';
import { cn } from '@/lib/utils';

function uploadErrorMessage(error: unknown): string {
  if (error instanceof SkillRequestError) {
    if (error.status === 400) {
      return '技能包不合法：请确认 zip 内含正确的 SKILL.md 结构。';
    }
    if (error.status === 403) {
      return '需要管理员权限才能上传技能。';
    }
    if (error.status >= 500) {
      return `服务暂时不可用（${error.status}），请稍后重试。`;
    }
    return error.message;
  }
  return '上传失败，请检查网络后重试。';
}

/**
 * ADMIN 上传入口：客户端只校验 .zip 扩展名，包结构由后端校验。
 * 失败时就地显示可读原因（400 / 403 / 5xx）。
 */
export function SkillUpload({
  onUploaded,
  uploading,
  onUploadingChange,
  label = '上传技能',
  variant = 'default',
  size = 'sm',
  className,
}: {
  onUploaded: (name: string) => void | Promise<void>;
  uploading: boolean;
  onUploadingChange: (uploading: boolean) => void;
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!/\.zip$/i.test(file.name)) {
      setError('仅支持 .zip 技能包。');
      return;
    }

    setError(null);
    onUploadingChange(true);
    try {
      const name = await uploadSkill(file);
      await onUploaded(name);
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      onUploadingChange(false);
    }
  }

  return (
    <div className={cn('flex min-w-0 flex-col items-start gap-1.5', className)}>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(event) => void handleFile(event)}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {uploading ? '上传中…' : label}
      </Button>
      {error && (
        <p role="alert" className="max-w-xs text-[11px] leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}