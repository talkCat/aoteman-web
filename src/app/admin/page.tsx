import { redirect } from 'next/navigation';

/** /admin 模块首页：默认进入权限规则。 */
export default function AdminIndexPage() {
  redirect('/admin/permissions');
}