import Link from "next/link";

const links = [
  { href: "/diary", label: "今日记录" },
  { href: "/search", label: "历史记录" },
];

export function AppNavigation() {
  return (
    <nav aria-label="主要入口" className="mt-10 flex flex-wrap gap-4">
      {links.map((link) => (
        <Link
          className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
