// Writes the synthetic mBoB screenshot used by the browser tests:
//
//	go run ./internal/receipts/synth/cmd testdata/receipts/mbob_synthetic.png
package main

import (
	"fmt"
	"os"

	"github.com/bugloper/xpensiv/internal/receipts/synth"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: mkfixture <out.png>")
		os.Exit(2)
	}
	f, err := os.Create(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer f.Close()
	if err := synth.MBoB(f, synth.DefaultMBoB); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
