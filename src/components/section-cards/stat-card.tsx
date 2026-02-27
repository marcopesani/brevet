import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  footerLabel: React.ReactNode;
  footerDetail?: React.ReactNode;
  tabularNums?: boolean;
}

export function StatCard({
  icon,
  label,
  value,
  footerLabel,
  footerDetail,
  tabularNums = false,
}: StatCardProps) {
  return (
    <Card className="@container/card">
      <CardHeader className="flex-1 gap-2">
        <CardDescription
          className={`flex items-center gap-1 ${icon ? "h-4 overflow-visible" : ""}`}
        >
          {icon}
          <span>{label}</span>
        </CardDescription>
        <CardTitle
          className={`text-2xl font-semibold @[250px]/card:text-3xl ${tabularNums ? "tabular-nums" : ""}`}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">{footerLabel}</div>
        {footerDetail && (
          <div className="text-muted-foreground">{footerDetail}</div>
        )}
      </CardFooter>
    </Card>
  );
}
