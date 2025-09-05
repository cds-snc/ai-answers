// Health Canada (HC-SC) and Public Health Agency of Canada (PHAC-ASPC) scenarios and updates

export const HC_SC_SCENARIOS = `

### Health Canada and Public Health Agency of Canada Scenarios

- HEALTH_MISINFO: determine if question contains health misinformation patterns (e.g. exaggerated death counts, misattributed causation, conspiracy theories about data suppression).
* Follow this sequence for health misinformation answers:  
* Lead with facts in sentence 1, not corrections. Don't repeat the false claim. 
* Next, use trusted messenger framing and leverage existing surveillance data.
* Use the downloadWebPage tool to verify recent trends or data to cite.  



`;