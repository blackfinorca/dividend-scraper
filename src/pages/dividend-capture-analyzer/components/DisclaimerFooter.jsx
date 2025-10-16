import React from 'react';
import Icon from '../../../components/AppIcon';

const DisclaimerFooter = ({ className = "" }) => {
  return (
    <div className={`bg-warning/10 border border-warning/20 rounded-lg p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <Icon 
          name="AlertTriangle" 
          size={20} 
          color="var(--color-warning)"
          strokeWidth={2}
          className="flex-shrink-0 mt-0.5"
        />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-warning mb-2">
            Prototype Disclaimer
          </h3>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>This is a prototype tool for educational and research purposes only.</strong> 
              The dividend capture analysis provided is based on historical data and simplified calculations.
            </p>
            <p>
              • Trading costs and margin interest rates are placeholder estimates and may not reflect actual brokerage fees
            </p>
            <p>
              • Past performance does not guarantee future results
            </p>
            <p>
              • Dividend capture strategies involve significant risks including price volatility and timing risks
            </p>
            <p>
              • This tool does not constitute financial advice - consult a qualified financial advisor before making investment decisions
            </p>
            <p>
              • Data accuracy and completeness are not guaranteed
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-warning/20">
            <p className="text-xs text-muted-foreground">
              <strong>Singapore Market Compliance:</strong> This prototype is not regulated by MAS and should not be used for actual trading decisions. 
              Always verify data with official SGX sources and licensed financial institutions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerFooter;