import matplotlib.pyplot as plt
import json

    # Read the data from allResults.json file
with open('allResults5million.json', 'r') as file:
    data = json.load(file)

# Display the data to verify
data

# Extracting data for visualization
addresses = [entry['address'] for entry in data]
blocks = [int(entry['block']) for entry in data if entry['bondId'] == 2]
sharesToCompensate = [int() for entry in data if entry['bondId'] == 2]


# print(sharesToCompensate)

lastRewardDebt = [-1, -1, -1, -1, -1, -1]

for entry in data:
    if entry['currentLpRewardDebt'] != lastRewardDebt[entry['bondId'] - 1]:
        lastRewardDebt[entry['bondId'] - 1] = entry['currentLpRewardDebt']
        print("Block", entry['block'], "bond", entry['bondId'], "lpRewardDebt", f"{float(entry['currentLpRewardDebt']) * 1e-18:18.18}", "Last reward @", entry['lastRewardBlock'], "LP reward to number of shares ratio", float(entry['currentLpRewardDebt']) / float(entry['currentNumberOfShares']))
    
# Create a bar chart
plt.figure(figsize=(10, 6))
plt.bar(blocks, sharesToCompensate, color='skyblue')
plt.xlabel('Address')
plt.ylabel('Number of Shares to Compensate')
plt.title('Number of Shares to Compensate for Each Address')
plt.xticks(rotation=45)
plt.tight_layout()

# Show the plot
plt.show()
