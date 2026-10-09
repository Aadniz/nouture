/*
 * noussh - the "ssh" that unison runs on Android (via -sshcmd).
 *
 * It does no SSH itself: it hands its argv to the Nouture app over an abstract
 * unix socket and then pipes stdin/stdout through that socket. The app resolves
 * the host from ~/.ssh/config, authenticates and runs the remote command.
 *
 * Wire format (client -> app): u32 length-prefixed strings, big endian:
 *   token, argc (as decimal string), argv[1..argc]
 * Reply (app -> client): "OK\n" or "ERR <message>\n", then the raw stream.
 */
#include <arpa/inet.h>
#include <errno.h>
#include <poll.h>
#include <signal.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#define BUF_SIZE 65536

static int write_all(int fd, const void *buf, size_t len) {
  const char *p = buf;
  while (len > 0) {
    ssize_t n = write(fd, p, len);
    if (n < 0) {
      if (errno == EINTR) continue;
      return -1;
    }
    p += n;
    len -= (size_t)n;
  }
  return 0;
}

static int send_str(int fd, const char *s) {
  size_t len = strlen(s);
  uint32_t n = htonl((uint32_t)len);
  if (write_all(fd, &n, sizeof n) < 0) return -1;
  return write_all(fd, s, len);
}

static int read_line(int fd, char *buf, size_t size) {
  size_t i = 0;
  while (i + 1 < size) {
    ssize_t n = read(fd, buf + i, 1);
    if (n < 0 && errno == EINTR) continue;
    if (n <= 0) return -1;
    if (buf[i] == '\n') break;
    i++;
  }
  buf[i] = '\0';
  return 0;
}

static int connect_app(const char *name) {
  struct sockaddr_un addr;
  size_t name_len = strlen(name);
  if (name_len + 1 > sizeof addr.sun_path) return -1;

  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return -1;

  memset(&addr, 0, sizeof addr);
  addr.sun_family = AF_UNIX;
  memcpy(addr.sun_path + 1, name, name_len); /* sun_path[0] = '\0': abstract */
  socklen_t len = (socklen_t)(offsetof(struct sockaddr_un, sun_path) + 1 + name_len);

  if (connect(fd, (struct sockaddr *)&addr, len) < 0) {
    close(fd);
    return -1;
  }
  return fd;
}

static int pump(int sock) {
  static char buf[BUF_SIZE];
  int stdin_open = 1;

  for (;;) {
    struct pollfd fds[2] = {
        {.fd = sock, .events = POLLIN},
        {.fd = stdin_open ? STDIN_FILENO : -1, .events = POLLIN},
    };
    if (poll(fds, 2, -1) < 0) {
      if (errno == EINTR) continue;
      return 255;
    }

    if (fds[0].revents & (POLLIN | POLLHUP | POLLERR)) {
      ssize_t n = read(sock, buf, sizeof buf);
      if (n < 0 && errno == EINTR) continue;
      if (n <= 0) return 0; /* app closed the channel */
      if (write_all(STDOUT_FILENO, buf, (size_t)n) < 0) return 255;
    }

    if (stdin_open && (fds[1].revents & (POLLIN | POLLHUP | POLLERR))) {
      ssize_t n = read(STDIN_FILENO, buf, sizeof buf);
      if (n < 0 && errno == EINTR) continue;
      if (n <= 0) {
        stdin_open = 0;
        shutdown(sock, SHUT_WR);
      } else if (write_all(sock, buf, (size_t)n) < 0) {
        return 255;
      }
    }
  }
}

int main(int argc, char **argv) {
  const char *name = getenv("NOUTURE_SSH_SOCKET");
  const char *token = getenv("NOUTURE_SSH_TOKEN");
  if (!name || !token) {
    fprintf(stderr, "noussh: must be started by Nouture\n");
    return 255;
  }

  signal(SIGPIPE, SIG_IGN);

  int sock = connect_app(name);
  if (sock < 0) {
    fprintf(stderr, "noussh: cannot reach Nouture: %s\n", strerror(errno));
    return 255;
  }

  char count[16];
  snprintf(count, sizeof count, "%d", argc - 1);
  if (send_str(sock, token) < 0 || send_str(sock, count) < 0) goto lost;
  for (int i = 1; i < argc; i++)
    if (send_str(sock, argv[i]) < 0) goto lost;

  char status[4096];
  if (read_line(sock, status, sizeof status) < 0) goto lost;
  if (strncmp(status, "ERR ", 4) == 0) {
    fprintf(stderr, "%s\n", status + 4);
    return 255;
  }
  if (strcmp(status, "OK") != 0) goto lost;

  return pump(sock);

lost:
  fprintf(stderr, "noussh: lost connection to Nouture\n");
  return 255;
}
