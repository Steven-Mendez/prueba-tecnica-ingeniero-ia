import { ChevronDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  label: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
}

// Filtro de varias opciones: vacío = todas
export function MultiSelect({ label, options, value, onChange }: Props) {
  const toggle = (option: string, checked: boolean) =>
    onChange(checked ? [...value, option] : value.filter((v) => v !== option))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {label}
          {value.length === 0 ? (
            <span className="text-muted-foreground">todos</span>
          ) : value.length === 1 ? (
            <Badge variant="secondary" className="max-w-32 truncate px-1.5">
              {value[0]}
            </Badge>
          ) : (
            <Badge variant="secondary" className="px-1.5 tabular-nums">
              {value.length}
            </Badge>
          )}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange([])} disabled={value.length === 0}>
          Todos
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={value.includes(option)}
            onCheckedChange={(checked) => toggle(option, checked === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
