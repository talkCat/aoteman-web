'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { PermissionCatalogTable } from '@/components/admin/PermissionCatalogTable';
import { PermissionPosture } from '@/components/admin/PermissionPosture';
import { PermissionRuleList } from '@/components/admin/PermissionRuleList';
import { Button } from '@/components/ui/button';
import {
  fetchPermissionCatalog,
  fetchPermissionRules,
} from '@/lib/permission';
import type {
  PermissionCatalogItem,
  PermissionRule,
} from '@/types/permission';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * 权限规则页：态势条 + 工具目录 + 本人规则。
 * catalog 与 rules 首次并发加载；规则保存 / 删除后只刷新 rules。
 * 设计依据：2026-10-24-智能体后台管理模块设计.md §4.2。
 */
export default function PermissionsPage() {
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesRefreshing, setRulesRefreshing] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const rulesRequestId = useRef(0);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      setCatalog(await fetchPermissionCatalog());
    } catch (error) {
      setCatalogError(errorMessage(error, '加载工具目录失败，请稍后重试。'));
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadRules = useCallback(async (mode: 'initial' | 'refresh') => {
    const requestId = ++rulesRequestId.current;
    if (mode === 'initial') setRulesLoading(true);
    else setRulesRefreshing(true);
    setRulesError(null);

    try {
      const nextRules = await fetchPermissionRules();
      if (requestId === rulesRequestId.current) setRules(nextRules);
    } catch (error) {
      if (requestId === rulesRequestId.current) {
        setRulesError(errorMessage(error, '加载权限规则失败，请稍后重试。'));
      }
    } finally {
      if (requestId === rulesRequestId.current) {
        setRulesLoading(false);
        setRulesRefreshing(false);
      }
    }
  }, []);

  const refreshRules = useCallback(() => loadRules('refresh'), [loadRules]);

  useEffect(() => {
    void Promise.all([loadCatalog(), loadRules('initial')]);
  }, [loadCatalog, loadRules]);

  const configurableCount = catalog.filter((item) => item.configurable).length;

  return (
    <div className="space-y-8">
      <p className="text-sm leading-relaxed text-muted-foreground">
        平台基线决定默认行为，个人规则只能收紧。变更在下一轮对话生效。
      </p>

      <PermissionPosture catalog={catalog} loading={catalogLoading} />

      <section aria-labelledby="permission-catalog-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="permission-catalog-heading" className="text-sm font-semibold tracking-tight">
              工具目录
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              不可配置工具恒放行，不会出现在新增规则的选择器里。
            </p>
          </div>
          {!catalogLoading && !catalogError && (
            <span className="text-xs text-muted-foreground">
              共 {catalog.length} 个工具 · {configurableCount} 个可配置
            </span>
          )}
        </div>

        {catalogError ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {catalogError}
            </p>
            <Button variant="outline" size="sm" onClick={() => void loadCatalog()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </Button>
          </div>
        ) : (
          <PermissionCatalogTable items={catalog} loading={catalogLoading} />
        )}
      </section>

      <PermissionRuleList
        catalog={catalog}
        rules={rules}
        loading={rulesLoading}
        refreshing={rulesRefreshing}
        error={rulesError}
        onRefresh={refreshRules}
      />
    </div>
  );
}
