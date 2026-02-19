"use client"

import { useChain } from "@/contexts/chain-context"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import type { ChainConfig } from "@/lib/chain-config"

const CHAIN_COLORS: Record<number, string> = {
  8453: "bg-blue-500",     // Base
  84532: "bg-blue-500",    // Base Sepolia
  42161: "bg-sky-500",     // Arbitrum
  421614: "bg-sky-500",    // Arbitrum Sepolia
  10: "bg-red-500",        // Optimism
  11155420: "bg-red-500",  // OP Sepolia
  137: "bg-purple-500",    // Polygon
  80002: "bg-purple-500",  // Polygon Amoy
}

function ChainDot({ chainId }: { chainId: number }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${CHAIN_COLORS[chainId] ?? "bg-gray-400"}`}
    />
  )
}

function chainDisplayName(config: ChainConfig): string {
  return config.chain.name
}

export function ChainSelector() {
  const { activeChain, setActiveChainId, supportedChains, isSwitchingChain } = useChain()

  const mainnets = supportedChains.filter((c) => !c.chain.testnet)
  const testnets = supportedChains.filter((c) => c.chain.testnet)

  return (
    <Select
      value={String(activeChain.chain.id)}
      onValueChange={(value) => setActiveChainId(Number(value))}
      disabled={isSwitchingChain}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue>
          <ChainDot chainId={activeChain.chain.id} />
          <span className="truncate">{chainDisplayName(activeChain)}</span>
          {activeChain.chain.testnet && (
            <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px] leading-tight">
              Testnet
            </Badge>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          <SelectLabel>Mainnets</SelectLabel>
          {mainnets.map((config) => (
            <SelectItem key={config.chain.id} value={String(config.chain.id)}>
              <ChainDot chainId={config.chain.id} />
              {chainDisplayName(config)}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Testnets</SelectLabel>
          {testnets.map((config) => (
            <SelectItem key={config.chain.id} value={String(config.chain.id)}>
              <ChainDot chainId={config.chain.id} />
              {chainDisplayName(config)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
