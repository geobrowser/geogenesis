export function getBlockPositionChanges(oldArray: string[], newArray: string[]) {
  // Find additions and removals
  const added = newArray.filter(item => !oldArray.includes(item));
  const removed = oldArray.filter(item => !newArray.includes(item));

  // Find common elements
  const commonItems = oldArray.filter(item => newArray.includes(item));

  // Create a copy of arrays with only common elements
  const oldCommonOrder = oldArray.filter(item => commonItems.includes(item));
  const newCommonOrder = newArray.filter(item => commonItems.includes(item));

  // Find the longest common subsequence (LCS)
  const lcs = findLCS(oldCommonOrder, newCommonOrder);

  // Elements in the common items but not in the LCS were moved
  const moved = [];

  for (const item of commonItems) {
    if (!lcs.includes(item)) {
      moved.push(item);
    }
  }

  return {
    added,
    removed,
    moved,
  };
}

/**
 * Finds the Longest Common Subsequence between two arrays
 * This represents the elements that stayed in the same relative order
 */
function findLCS(arr1: string[], arr2: string[]) {
  const m = arr1.length;
  const n = arr2.length;

  // Create DP table
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  // Fill the dp table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Reconstruct the LCS
  const lcs = [];
  let i = m,
    j = n;

  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}
