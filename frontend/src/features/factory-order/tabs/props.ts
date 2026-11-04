import type { Dispatch } from 'react'

import type { ParametersAction } from '../parameters/state'
import type { CalculationResult, ParameterDefaults, Parameters } from '../types'

export interface TabProps {
  result: CalculationResult
  parameters: Parameters
  defaults: ParameterDefaults
  changes: string[]
  dispatch: Dispatch<ParametersAction>
}
