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

function ChainDot({ color }: { color: string }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${color}`}
    />
  )
}

export function ChainSelector() {
  const { activeChain, setActiveChainId, supportedChains, isSwitchingChain } = useChain()

  const mainnets = supportedChains.filter((c) => !c.isTestnet)
  const testnets = supportedChains.filter((c) => c.isTestnet)

  return (
    <Select
      value={String(activeChain.chain.id)}
      onValueChange={(value) => setActiveChainId(Number(value))}
      disabled={isSwitchingChain}
    >
      <SelectTrigger size="default" className="w-full">
        <SelectValue>
          <ChainDot color={activeChain.color} />
          <span className="truncate">{activeChain.displayName}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          <SelectLabel>Mainnets</SelectLabel>
          {mainnets.map((config) => (
            <SelectItem key={config.chain.id} value={String(config.chain.id)}>
              <ChainDot color={config.color} />
              {config.displayName}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Testnets</SelectLabel>
          {testnets.map((config) => (
            <SelectItem key={config.chain.id} value={String(config.chain.id)}>
              <ChainDot color={config.color} />
              {config.displayName}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
