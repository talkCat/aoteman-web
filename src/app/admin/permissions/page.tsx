'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ListChecks, RefreshCw, ShieldCheck, SlidersHorizontal, Wrench } from 'lucide-react';

import { PageHeader } from '@/components/admin/PageHeader';
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
  const readOnlyCount = catalog.length - configurableCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="权限规则"
        eyebrow="GUARDRAILS"
        art={{ src: "/brand/permission-3d.png", width: 320, height: 320 }}
        description="平台基线决定默认行为，个人规则只能收紧。变更在下一轮对话生效。"
      />

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-icon" aria-hidden="true">
              <Wrench className="h-4 w-4" />
            </span>
            <span className="admin-stat-delta">{catalogLoading ? '加载中' : '权限目录'}</span>
          </div>
          <strong className="admin-stat-value">{catalogLoading ? '—' : catalog.length}</strong>
          <span className="admin-stat-label">工具总数</span>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-icon" data-tone="cyan" aria-hidden="true">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <span className="admin-stat-delta">{catalogLoading ? '加载中' : '可收紧'}</span>
          </div>
          <strong className="admin-stat-value">{catalogLoading ? '—' : configurableCount}</strong>
          <span className="admin-stat-label">可配置工具</span>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-icon" data-tone="amber" aria-hidden="true">
              <ListChecks className="h-4 w-4" />
            </span>
            <span className="admin-stat-delta">{'下一轮生效'}</span>
          </div>
          <strong className="admin-stat-value">{rulesLoading ? '—' : rules.length}</strong>
          <span className="admin-stat-label">生效规则</span>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-icon" data-tone="green" aria-hidden="true">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="admin-stat-delta">{catalogLoading ? '加载中' : '未接入引擎'}</span>
          </div>
          <strong className="admin-stat-value">{catalogLoading ? '—' : readOnlyCount}</strong>
          <span className="admin-stat-label">恒放行工具</span>
        </div>
      </div>

      <PermissionPosture catalog={catalog} loading={catalogLoading} />

      <section aria-labelledby="permission-catalog-heading" className="admin-panel">
        <div className="admin-panel-bar">
          <div className="min-w-0">
            <h2 id="permission-catalog-heading" className="admin-panel-title">
              工具目录
            </h2>
            <p className="admin-panel-subtitle">
              不可配置工具恒放行，不会出现在新增规则的选择器里。
            </p>
          </div>
          {!catalogLoading && !catalogError && (
            <span className="text-xs tabular-nums text-muted-foreground">
              共 {catalog.length} 个工具 · {configurableCount} 个可配置
            </span>
          )}
        </div>

        {catalogError ? (
          <div className="m-3 flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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
