import pandas as pd

try:
    df1 = pd.read_excel(r'C:\Users\Administrator\Desktop\未处理.xlsx')
    df2 = pd.read_excel(r'C:\Users\Administrator\Desktop\成果(1).xlsx')
    
    print("----- 未处理.xlsx -----")
    print(f"Shape: {df1.shape}")
    print("Columns:", df1.columns.tolist()[:15]) # Print first 15 columns
    print(df1.head(2).to_string())
    
    print("\n----- 成果(1).xlsx -----")
    print(f"Shape: {df2.shape}")
    print("Columns:", df2.columns.tolist()[:15])
    print(df2.head(2).to_string())
    
    # Try to find differences
    # Find columns that are different
    common_cols = set(df1.columns).intersection(set(df2.columns))
    only_1 = set(df1.columns) - set(df2.columns)
    only_2 = set(df2.columns) - set(df1.columns)
    
    print(f"\nColumns only in 未处理: {only_1}")
    print(f"Columns only in 成果(1): {only_2}")
    
except Exception as e:
    print(f"Error: {e}")
