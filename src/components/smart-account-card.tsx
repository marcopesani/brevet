import { getChainById } from "@/lib/chain-config";
import { getUsdcBalance } from "@/lib/hot-wallet";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SmartAccountCardProps {
  chainId: number;
  address: string;
  isCurrentChain: boolean;
}

export async function SmartAccountCard({
  chainId,
  address,
  isCurrentChain,
}: SmartAccountCardProps) {
  const chainName = getChainById(chainId);
  const usdcBalance = await getUsdcBalance(address, chainId);
  return (
    <Card>
      <CardHeader>
        {isCurrentChain && (
          <CardAction>
            <Badge variant="default">Current Chain</Badge>
          </CardAction>
        )}
        <CardTitle>{chainName?.displayName ?? `Chain ${chainId}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>USDC Balance: {usdcBalance}</p>
        <div className="text-xs text-muted-foreground text-ellipsis overflow-hidden whitespace-nowrap">{address}</div>
      </CardContent>
      <CardFooter className="flex gap-2">
      <Button variant="outline" className="flex-1">
          Fund
        </Button>
        <Button variant="outline" className="flex-1">
          Withdraw
        </Button>
      </CardFooter>
    </Card>
  );
}
